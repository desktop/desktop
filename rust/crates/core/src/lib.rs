//! Repository workflows shared by the CLI and browser/native transports.
mod accounts;
pub use accounts::{
    AccountAssignment, AccountTarget, RepositoryAccount, ScopedAssociation, StoredAccount,
};
mod repository_context;
pub use repository_context::{
    ForkContributionTarget, RepositoryContext, RepositoryIdentity, RepositoryMetadata,
};
mod repo_rules;
pub use repo_rules::{NameRuleFailure, NameRulesActor, NameRulesPolicy};
mod branch_policy;
pub mod cancellation;
pub use branch_policy::{BranchPermissions, BranchPolicy, DefaultBranch};
mod commit;
mod diff;
mod editors;
pub use editors::{EditorLaunch, ExternalEditor, available_editors};
mod discard;
mod discard_fs;
mod git_credentials;
mod github;
mod github_api;
mod github_checkout;
mod github_create;
pub use git_credentials::helper as git_credential_helper;
mod lfs;
mod lfs_attributes;
mod lfs_operations;
pub use lfs::LfsInstallScope;
pub use lfs_operations::{LfsTransferRequest, lfs_install, lfs_tool_status};
mod paths;
mod preferences;
mod publish;
mod publish_origin;
pub use publish_origin::publication_config_preflight;
mod publish_receipt;
mod settings;
mod storage;
pub use paths::directory_path;
mod submodules;
mod worktrees;
pub use preferences::{Preferences, PreferencesPatch, PreferencesStore, Theme};
pub use settings::{ConfigScope, git_settings, set_git_setting};
mod history;
mod stash;
pub use stash::remote_deletion::{RemoteBranchDeletion, UpstreamDeletion};
mod state;
pub use state::OperationState;
mod process;
pub use github::{GitHubAction, GitHubRequest, execute_github};
mod protocol;
mod registry;
mod status;
use anyhow::{Context, Result, bail};
pub use protocol::*;
pub use registry::{
    Registry, SavedRepositories, SavedRepositoryRecord, clone_repository, initialize,
};
use serde_json::Value;
use std::{
    ffi::OsString,
    path::{Component, Path, PathBuf},
    sync::Arc,
};
use tokio::sync::Mutex;

#[derive(Clone)]
pub struct Repository {
    path: PathBuf,
    gate: Arc<Mutex<()>>,
    saved_scope: Option<SavedRepositoryScope>,
}

#[derive(Clone)]
struct SavedRepositoryScope {
    registry: Registry,
    record_id: Option<String>,
}

impl Repository {
    /// Resolve the working tree root so all clients agree on relative paths.
    pub async fn open(path: &Path) -> Result<Self> {
        let path = path.canonicalize().context("resolve repository path")?;
        let output = process::run(&path, &args(&["rev-parse", "--show-toplevel"])).await?;
        if output.code != 0 {
            bail!("not a working tree: {}", output.text().stderr.trim());
        }
        let root = output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout);
        Ok(Self {
            path: PathBuf::from(os_from_bytes(root)?),
            gate: Arc::new(Mutex::new(())),
            saved_scope: None,
        })
    }

    /// Associate this handle with a registry without reading or creating files.
    pub fn with_registry(mut self, registry: Registry) -> Self {
        self.saved_scope = Some(SavedRepositoryScope {
            registry,
            record_id: None,
        });
        self
    }

    /// Bind a known saved record so forget/re-add cannot select a different account.
    pub fn with_saved_record(mut self, registry: Registry, id: String) -> Self {
        self.saved_scope = Some(SavedRepositoryScope {
            registry,
            record_id: Some(id),
        });
        self
    }

    /// Identify a fixed startup scope without reading account or registry files.
    pub fn fixed_saved_record(&self) -> Option<(String, &str)> {
        self.saved_scope.as_ref().and_then(|scope| {
            scope
                .record_id
                .as_deref()
                .map(|id| (scope.registry.namespace_id(), id))
        })
    }

    pub(crate) fn account_registry(&self) -> Option<&Registry> {
        self.saved_scope.as_ref().map(|scope| &scope.registry)
    }

    pub(crate) fn saved_record(&self) -> Result<Option<registry::SavedRepositoryRecord>> {
        let Some(scope) = &self.saved_scope else {
            return Ok(None);
        };
        if let Some(id) = &scope.record_id {
            let record = scope
                .registry
                .record_by_id(id)?
                .context("Saved repository changed; select it again")?;
            anyhow::ensure!(
                record.path == self.path,
                "Saved repository working tree changed; select it again"
            );
            Ok(Some(record))
        } else {
            scope.registry.record_for_path(&self.path)
        }
    }

    /// Select a native registered worktree, preserving or adopting its saved record.
    pub async fn open_worktree(&self, path: GitPath) -> Result<Self> {
        let registry = self
            .account_registry()
            .context("Select a repository registry before opening a worktree")?
            .clone();
        let requested = directory_path(path)?;
        let requested = if requested.is_absolute() {
            requested
        } else {
            self.path.join(requested)
        };
        let target = Self::open(&requested).await?;
        anyhow::ensure!(
            requested.canonicalize()? == target.path,
            "Worktree path must name its working tree root"
        );
        // A stale registered path may now contain a different repository.
        // Common-directory equality validates membership, never account scope.
        anyhow::ensure!(
            self.common_directory().await? == target.common_directory().await?,
            "Working tree belongs to another repository"
        );
        let worktrees = self.worktrees().await?;
        let mut known = false;
        for worktree in worktrees
            .as_array()
            .context("Invalid native working tree list")?
        {
            let path = directory_path(serde_json::from_value(worktree["path"].clone())?)?;
            if path.canonicalize().is_ok_and(|path| path == target.path) {
                known = worktree["bare"] == false && worktree["prunable"].is_null();
                break;
            }
        }
        anyhow::ensure!(known, "Path is not an available registered working tree");
        let source = self.saved_record()?;
        let root = target.path.clone();
        let saved_registry = registry.clone();
        let record = cancellation::blocking(move || {
            saved_registry.switch_worktree_record(source.as_ref(), root)
        })
        .await?;
        Ok(target.with_saved_record(registry, record.id))
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    /// Stable native-path identity shared by snapshots and transport selection fences.
    pub fn id(&self) -> String {
        use sha2::{Digest, Sha256};
        format!(
            "{:x}",
            Sha256::digest(self.path.as_os_str().as_encoded_bytes())
        )
    }

    /// Serialize operations across sessions sharing this repository handle.
    pub async fn execute(&self, operation: Operation) -> Result<Value> {
        let _guard = cancellation::wait(self.gate.lock()).await?;
        cancellation::Cancellation::current().check()?;
        if matches!(
            operation,
            Operation::PublishContinuePreview { .. } | Operation::PublishContinue { .. }
        ) {
            publication_config_preflight(&self.path).await?;
        }
        git_credentials::scope(
            self,
            &operation,
            Box::pin(self.execute_inner(operation.clone())),
        )
        .await
    }

    async fn execute_inner(&self, operation: Operation) -> Result<Value> {
        if let Operation::Github { request } = operation {
            return self.execute_github_bound(request).await;
        }
        if matches!(operation, Operation::Snapshot) {
            return Ok(serde_json::to_value(self.snapshot().await?)?);
        }
        match operation {
            Operation::CommitPreview => return self.commit_preview().await,
            Operation::Commit {
                summary,
                description,
                allow_large_files,
                basis,
            } => {
                return self
                    .reviewed_commit(summary, description, allow_large_files, basis)
                    .await;
            }
            Operation::LfsTransfer { request } => return self.lfs_transfer(request).await,
            Operation::LfsCheckout { patterns } => return self.lfs_checkout(patterns).await,
            Operation::LfsTrack {
                patterns,
                filename,
                lockable,
            } => return self.lfs_track(patterns, filename, lockable, false).await,
            Operation::LfsUntrack { patterns } => {
                return self.lfs_track(patterns, false, None, true).await;
            }
            Operation::LfsToolStatus => return lfs_tool_status(&self.path).await,
            Operation::LfsStatus { paths } => return self.lfs_status(paths).await,
            Operation::LfsInstall {
                scope,
                force,
                skip_repo,
                skip_smudge,
            } => return lfs_install(&self.path, scope, force, skip_repo, skip_smudge).await,
            Operation::Submodules => return self.submodules().await,
            Operation::SubmoduleUpdate { paths, recursive } => {
                return self
                    .submodule_command("update", paths, recursive, false)
                    .await;
            }
            Operation::SubmoduleSync { paths, recursive } => {
                return self
                    .submodule_command("sync", paths, recursive, false)
                    .await;
            }
            Operation::SubmoduleDeinit { paths, force } => {
                return self.submodule_command("deinit", paths, false, force).await;
            }
            Operation::SubmoduleAdd { url, path, name } => {
                return self.submodule_add(url, path, name).await;
            }

            Operation::GitSettings { scope } => return git_settings(&self.path, scope).await,
            Operation::SetGitSetting { scope, key, value } => {
                return set_git_setting(&self.path, scope, &key, value).await;
            }
            Operation::Worktrees => return self.worktrees().await,
            Operation::WorktreeAdd {
                path,
                branch,
                new_branch,
                start,
            } => return self.worktree_add(path, branch, new_branch, start).await,
            Operation::WorktreeRemove { path, force } => {
                return self.worktree_remove(path, force).await;
            }
            Operation::WorktreeMove { from, to } => return self.worktree_move(from, to).await,
            Operation::WorktreeLock {
                path,
                locked,
                reason,
            } => return self.worktree_lock(path, locked, reason).await,

            Operation::CheckoutPreview { branch } => return self.checkout_preview(&branch).await,
            Operation::CheckoutHistory => return self.checkout_history().await,
            Operation::AcknowledgeCheckout { receipt_id } => {
                return self.acknowledge_checkout(&receipt_id).await;
            }
            Operation::Checkout {
                branch,
                strategy,
                basis,
                replace_stash,
                restore_index,
            } => {
                return self
                    .checkout_reviewed(
                        &branch,
                        strategy,
                        basis.as_deref(),
                        replace_stash,
                        restore_index,
                    )
                    .await;
            }
            Operation::StashList => return self.stash_list().await,
            Operation::StashSave {
                message,
                include_untracked,
                desktop,
            } => return self.stash_save(message, include_untracked, desktop).await,
            Operation::StashFiles { oid } => return self.stash_files(&oid).await,
            Operation::StashApply {
                oid,
                index,
                basis,
                restore_index,
                pop,
            } => {
                return self
                    .stash_apply(&oid, index, basis.as_deref(), restore_index, pop)
                    .await;
            }
            Operation::StashDrop { oid, index, basis } => {
                return self.stash_drop(&oid, index, &basis).await;
            }
            Operation::StashMove {
                oid,
                index,
                basis,
                branch,
            } => return self.stash_move(&oid, index, &basis, &branch).await,
            Operation::History {
                revision,
                offset,
                limit,
            } => return self.history(revision, offset, limit).await,
            Operation::CommitFiles { commit, parent } => {
                return self.commit_files(&commit, parent).await;
            }
            Operation::CommitDiff {
                path,
                commit,
                parent,
            } => return self.commit_file_diff(path, &commit, parent).await,
            Operation::CreateBranchPreview {
                name,
                start_point,
                no_track,
                checkout,
            } => {
                return self
                    .create_branch_preview(&name, start_point, no_track, checkout)
                    .await;
            }
            Operation::CreateBranch {
                name,
                start_point,
                no_track,
                checkout,
                strategy,
                basis,
                replace_stash,
                restore_index,
            } => {
                return self
                    .create_branch_reviewed(
                        &name,
                        stash::checkout::CreationRequest {
                            start_point,
                            no_track,
                            track_direct: false,
                            checkout,
                        },
                        strategy,
                        basis.as_deref(),
                        replace_stash,
                        restore_index,
                    )
                    .await;
            }
            Operation::DeleteBranchPreview {
                name,
                to_checkout,
                upstream,
            } => {
                return self
                    .delete_branch_preview(&name, to_checkout.as_deref(), upstream.as_ref())
                    .await;
            }
            Operation::DeleteBranch {
                name,
                to_checkout,
                force,
                strategy,
                basis,
                replace_stash,
                restore_index,
                upstream,
            } => {
                return self
                    .delete_branch_reviewed(
                        &name,
                        stash::checkout::DeletionRequest {
                            to_checkout,
                            force,
                            strategy,
                            basis,
                            replace_stash,
                            restore_index,
                            upstream,
                        },
                    )
                    .await;
            }
            Operation::RemoteDeletionTargets => return self.remote_deletion_targets().await,
            Operation::RemoteBranchDeletePreview { request } => {
                return self.remote_branch_delete_preview(request).await;
            }
            Operation::DeleteRemoteBranch { request, basis } => {
                return self.delete_remote_branch(request, basis.as_deref()).await;
            }
            Operation::RemoteDeletionHistory => return self.remote_deletion_history().await,
            Operation::RestoreRemoteTip {
                receipt_id,
                endpoint,
                name,
            } => return self.restore_remote_tip(&receipt_id, endpoint, &name).await,
            Operation::ForgetRemoteDeletion { receipt_id } => {
                return self.forget_remote_deletion(&receipt_id).await;
            }
            Operation::DeletedBranches => return self.deleted_branches().await,
            Operation::RestoreDeletedBranch { receipt_id, name } => {
                return self
                    .restore_deleted_branch(&receipt_id, name.as_deref())
                    .await;
            }
            Operation::ForgetDeletedBranch { receipt_id } => {
                return self.forget_deleted_branch(&receipt_id).await;
            }
            Operation::BranchList => return self.branch_list_with_policy().await,
            Operation::UpstreamSetupPreview => return self.upstream_setup_preview().await,
            Operation::SetupUpstream { basis } => {
                return self.setup_upstream(basis.as_deref()).await;
            }
            Operation::PublishContext { host } => return self.publish_context(&host).await,
            Operation::PublishPreview { request } => return self.publish_preview(&request).await,
            Operation::PublishCreate {
                request,
                basis,
                acknowledge_partial,
            } => {
                return self
                    .publish_create(&request, &basis, acknowledge_partial)
                    .await;
            }
            Operation::PublishContinuePreview { receipt_id } => {
                return self.publish_continue_preview(&receipt_id).await;
            }
            Operation::PublishContinue {
                receipt_id,
                basis,
                acknowledge_partial,
            } => {
                return self
                    .publish_continue(&receipt_id, &basis, acknowledge_partial)
                    .await;
            }
            Operation::PublishHistory {} => return self.publish_history().await,
            Operation::AcknowledgePublish { receipt_id } => {
                return self.acknowledge_publish(&receipt_id).await;
            }
            Operation::PublishOrganizations { host, target } => {
                return self.publish_organizations(&host, target).await;
            }
            Operation::RepositoryAccount => return self.repository_account().await,
            Operation::RepositoryAccountCatalog => return self.repository_account_catalog().await,
            Operation::RepositoryAccountPreview { target } => {
                return self.repository_account_preview(target).await;
            }
            Operation::SetRepositoryAccount { target, basis } => {
                return self.set_repository_account(target, &basis).await;
            }
            Operation::RepositoryContext => return self.repository_context().await,
            Operation::RefreshRepositoryContext => return self.refresh_repository_context().await,
            Operation::SetForkContributionTarget { target, basis } => {
                return self
                    .set_fork_contribution_target(target, basis.as_deref())
                    .await;
            }
            Operation::BranchNameRules { name } => {
                return Ok(serde_json::to_value(self.branch_name_rules(&name).await?)?);
            }
            Operation::BranchPolicy => {
                return Ok(serde_json::to_value(self.branch_policy().await?)?);
            }
            Operation::RenameBranchPreview { name, new_name } => {
                return self.rename_branch_preview(&name, &new_name).await;
            }
            Operation::RenameBranch {
                name,
                new_name,
                basis,
            } => return self.rename_branch(&name, &new_name, basis.as_deref()).await,
            Operation::BranchRenameHistory => return self.branch_rename_history().await,
            Operation::AcknowledgeBranchRename { receipt_id } => {
                return self.acknowledge_branch_rename(&receipt_id).await;
            }
            Operation::ConflictDetail { path } => return self.conflict_detail(path).await,
            Operation::StageConflict {
                path,
                basis,
                allow_markers,
            } => return self.stage_conflict(path, &basis, allow_markers).await,
            Operation::ResolveConflict {
                path,
                choice,
                basis,
            } => return self.resolve_conflict(path, choice, &basis).await,

            Operation::DiscardPreview {
                path,
                scope,
                selection,
            } => return self.discard_preview(path, scope, selection).await,
            Operation::Discard {
                path,
                scope,
                selection,
                basis,
            } => return self.discard(path, scope, selection, &basis).await,
            Operation::ForgetDiscard { undo_id } => return self.forget_discard(&undo_id).await,
            Operation::ListDiscards => return self.list_discards().await,
            Operation::UndoDiscard { undo_id } => return self.undo_discard(&undo_id).await,
            Operation::DiffDetail { path, staged } => return self.diff_detail(path, staged).await,
            Operation::SelectDiff {
                path,
                staged,
                basis,
                lines,
            } => return self.select_diff(path, staged, &basis, lines).await,
            _ => {}
        }
        let command = self.command(operation).await?;
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }

    async fn run(&self, command: &[OsString]) -> Result<process::RawOutput> {
        process::run(&self.path, command).await
    }

    async fn command(&self, operation: Operation) -> Result<Vec<OsString>> {
        use Operation::*;
        let command = match operation {
            RenameBranch { .. }
            | RenameBranchPreview { .. }
            | BranchRenameHistory
            | AcknowledgeBranchRename { .. } => unreachable!("handled by execute"),
            TrackBranch { name, upstream } => {
                self.validate_branch(&name).await?;
                self.resolve_commit(&upstream).await?;
                let full = self
                    .run(&args(&[
                        "rev-parse",
                        "--symbolic-full-name",
                        "--verify",
                        "--end-of-options",
                        &upstream,
                    ]))
                    .await?;
                let reference = String::from_utf8(full.stdout)?.trim().to_owned();
                if full.code != 0 || !reference.starts_with("refs/") {
                    bail!("upstream must name a branch ref");
                }
                args(&[
                    "branch",
                    &format!("--set-upstream-to={reference}"),
                    "--",
                    &name,
                ])
            }
            Detach { commit } => {
                args(&["switch", "--detach", &self.resolve_commit(&commit).await?])
            }
            Recover { kind, action } => {
                let expected = match kind {
                    RecoveryKind::Merge => "merge",
                    RecoveryKind::Rebase => "rebase",
                    RecoveryKind::CherryPick => "cherry_pick",
                    RecoveryKind::Revert => "revert",
                    RecoveryKind::Am => "am",
                };
                if self
                    .operation_state()
                    .await?
                    .is_none_or(|state| state.kind != expected)
                {
                    bail!("the requested Git operation is not in progress");
                }
                if matches!(kind, RecoveryKind::Merge) && matches!(action, RecoveryAction::Skip) {
                    bail!("merge has no skip action");
                }
                let command = if expected == "cherry_pick" {
                    "cherry-pick"
                } else {
                    expected
                };
                let flag = match action {
                    RecoveryAction::Continue => "--continue",
                    RecoveryAction::Abort => "--abort",
                    RecoveryAction::Skip => "--skip",
                    RecoveryAction::Quit => "--quit",
                };
                args(&[command, flag])
            }
            WorktreePrune { dry_run } => {
                let mut command = args(&["worktree", "prune", "--verbose"]);
                if dry_run {
                    command.push("--dry-run".into());
                }
                command
            }
            GitSettings { .. }
            | SetGitSetting { .. }
            | Worktrees
            | WorktreeAdd { .. }
            | WorktreeRemove { .. }
            | WorktreeMove { .. }
            | WorktreeLock { .. } => unreachable!("handled by execute"),
            Submodules
            | SubmoduleUpdate { .. }
            | SubmoduleSync { .. }
            | SubmoduleDeinit { .. }
            | SubmoduleAdd { .. } => unreachable!("handled by execute"),
            Status => args(&[
                "status",
                "--porcelain=v1",
                "--branch",
                "--untracked-files=normal",
            ]),
            LfsTransfer { .. }
            | LfsCheckout { .. }
            | LfsTrack { .. }
            | LfsUntrack { .. }
            | LfsToolStatus
            | LfsStatus { .. }
            | LfsInstall { .. } => unreachable!("handled by execute"),
            Snapshot
            | Github { .. }
            | DiffDetail { .. }
            | SelectDiff { .. }
            | DiscardPreview { .. }
            | Discard { .. }
            | ListDiscards
            | ForgetDiscard { .. }
            | UndoDiscard { .. }
            | History { .. }
            | CommitFiles { .. }
            | CommitDiff { .. }
            | BranchList
            | BranchPolicy
            | BranchNameRules { .. }
            | RepositoryContext
            | PublishContext { .. }
            | PublishPreview { .. }
            | PublishCreate { .. }
            | PublishContinuePreview { .. }
            | PublishContinue { .. }
            | PublishHistory {}
            | AcknowledgePublish { .. }
            | PublishOrganizations { .. }
            | RepositoryAccount
            | RepositoryAccountCatalog
            | RepositoryAccountPreview { .. }
            | SetRepositoryAccount { .. }
            | UpstreamSetupPreview
            | SetupUpstream { .. }
            | RefreshRepositoryContext
            | SetForkContributionTarget { .. }
            | ConflictDetail { .. }
            | StageConflict { .. }
            | ResolveConflict { .. } => {
                unreachable!("handled by execute")
            }
            Log => args(&[
                "log",
                "-30",
                "--oneline",
                "--decorate",
                "--no-show-signature",
            ]),
            Branches => args(&["branch", "--list", "--no-color"]),
            Diff { staged, path } => {
                let mut command = args(&["diff", "--no-ext-diff", "--no-textconv", "--no-color"]);
                if staged {
                    command.push("--cached".into());
                }
                command.push("--".into());
                if let Some(path) = path {
                    command.push(validate_path(path)?);
                }
                command
            }
            Stage { paths } => path_command(&["add", "--"], paths)?,
            Unstage { paths } => {
                // reset HEAD does not work before the first commit.
                let head = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
                if head.code == 0 {
                    path_command(&["reset", "--quiet", "HEAD", "--"], paths)?
                } else {
                    path_command(&["rm", "--cached", "--force", "--quiet", "--"], paths)?
                }
            }
            Commit { .. } | CommitPreview => unreachable!("handled by execute"),
            Checkout { .. }
            | CheckoutPreview { .. }
            | CheckoutHistory
            | AcknowledgeCheckout { .. } => unreachable!("handled by execute"),
            CreateBranch { .. } | CreateBranchPreview { .. } => unreachable!("handled by execute"),
            RemoteDeletionTargets
            | RemoteBranchDeletePreview { .. }
            | DeleteRemoteBranch { .. }
            | RemoteDeletionHistory
            | RestoreRemoteTip { .. }
            | ForgetRemoteDeletion { .. } => unreachable!("handled by execute"),
            DeleteBranch { .. }
            | DeleteBranchPreview { .. }
            | DeletedBranches
            | RestoreDeletedBranch { .. }
            | ForgetDeletedBranch { .. } => unreachable!("handled by execute"),
            Fetch { remote } => {
                validate_remote(&remote)?;
                args(&["fetch", "--", &remote])
            }
            Pull { remote, branch } => {
                validate_remote(&remote)?;
                self.validate_branch(&branch).await?;
                args(&["pull", "--ff-only", "--", &remote, &branch])
            }
            Push {
                remote,
                branch,
                set_upstream,
            } => {
                validate_remote(&remote)?;
                self.validate_branch(&branch).await?;
                let mut command = args(&["push"]);
                if set_upstream {
                    command.push("--set-upstream".into());
                }
                command.extend(args(&[
                    "--",
                    &remote,
                    &format!("refs/heads/{branch}:refs/heads/{branch}"),
                ]));
                command
            }
            Merge { branch } => args(&["merge", "--no-edit", &self.resolve_commit(&branch).await?]),
            MergeAbort => args(&["merge", "--abort"]),
            Rebase { branch } => args(&["rebase", &self.resolve_commit(&branch).await?]),
            RebaseAbort => args(&["rebase", "--abort"]),
            RebaseContinue => args(&["rebase", "--continue"]),
            CherryPick { commit, mainline } => {
                self.replay_command("cherry-pick", &commit, mainline)
                    .await?
            }
            Revert { commit, mainline } => self.replay_command("revert", &commit, mainline).await?,
            StashSave { .. }
            | StashList
            | StashFiles { .. }
            | StashApply { .. }
            | StashDrop { .. }
            | StashMove { .. } => unreachable!("handled by execute"),
            Tags => args(&["tag", "--list"]),
            TagCreate { name, target } => {
                self.validate_tag(&name).await?;
                let target = self
                    .resolve_commit(target.as_deref().unwrap_or("HEAD"))
                    .await?;
                args(&["tag", "--", &name, &target])
            }
            TagDelete { name } => {
                self.validate_tag(&name).await?;
                args(&["tag", "-d", "--", &name])
            }
            Remotes => args(&["remote", "-v"]),
            AddRemote { name, url } => {
                validate_remote(&name)?;
                if url.is_empty()
                    || url.starts_with('-')
                    || url.contains(['\0', '\n', '\r'])
                    || url.starts_with("ext::")
                {
                    bail!("invalid remote URL");
                }
                args(&["remote", "add", "--", &name, &url])
            }
            RemoveRemote { name } => {
                validate_remote(&name)?;
                args(&["remote", "remove", "--", &name])
            }
        };
        Ok(command)
    }

    async fn replay_command(
        &self,
        command: &str,
        commit: &str,
        mainline: Option<u32>,
    ) -> Result<Vec<OsString>> {
        let mut values = args(&[command]);
        if command == "revert" {
            values.push("--no-edit".into());
        }
        if let Some(mainline) = mainline {
            if mainline == 0 {
                bail!("mainline is one-based");
            }
            values.extend(args(&["--mainline", &mainline.to_string()]));
        }
        values.push(self.resolve_commit(commit).await?.into());
        Ok(values)
    }

    async fn validate_branch(&self, name: &str) -> Result<()> {
        if name.starts_with('-') || name.contains("@{") {
            bail!("invalid branch name");
        }
        let output = self
            .run(&args(&["check-ref-format", "--branch", name]))
            .await?;
        if output.code != 0 {
            bail!("invalid branch name");
        }
        Ok(())
    }

    async fn validate_tag(&self, name: &str) -> Result<()> {
        if name.starts_with('-') {
            bail!("invalid tag name");
        }
        let output = self
            .run(&args(&["check-ref-format", &format!("refs/tags/{name}")]))
            .await?;
        if output.code != 0 {
            bail!("invalid tag name");
        }
        Ok(())
    }

    async fn resolve_commit(&self, revision: &str) -> Result<String> {
        let output = self
            .run(&args(&[
                "rev-parse",
                "--verify",
                "--end-of-options",
                &format!("{revision}^{{commit}}"),
            ]))
            .await?;
        if output.code != 0 {
            bail!("revision does not resolve to a commit");
        }
        Ok(String::from_utf8(output.stdout)?.trim().to_owned())
    }
}

fn args(values: &[&str]) -> Vec<OsString> {
    values.iter().map(OsString::from).collect()
}

fn validate_remote(remote: &str) -> Result<()> {
    if remote.is_empty()
        || remote.starts_with(['-', '.'])
        || !remote
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
    {
        bail!("invalid configured remote name");
    }
    Ok(())
}

fn path_command(prefix: &[&str], paths: Vec<GitPath>) -> Result<Vec<OsString>> {
    if paths.is_empty() {
        bail!("select at least one file");
    }
    let mut command = args(prefix);
    for path in paths {
        command.push(validate_path(path)?);
    }
    Ok(command)
}

fn validate_path(path: GitPath) -> Result<OsString> {
    let value = match path {
        GitPath::Text(text) => OsString::from(text),
        GitPath::Bytes { bytes } => os_from_bytes(&bytes)?,
    };
    let path = Path::new(&value);
    if value.is_empty()
        || path.is_absolute()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        bail!("path must be a literal repository-relative file path");
    }
    // NUL cannot be passed to an operating system command.
    if value.as_encoded_bytes().contains(&0) {
        bail!("path contains NUL");
    }
    Ok(value)
}

fn os_from_bytes(bytes: &[u8]) -> Result<OsString> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStringExt;
        Ok(OsString::from_vec(bytes.to_vec()))
    }
    #[cfg(not(unix))]
    {
        Ok(OsString::from(std::str::from_utf8(bytes)?))
    }
}

#[cfg(test)]
mod future_size_tests {
    use super::*;
    #[test]
    fn repository_operation_future_fits_normal_process_stacks() {
        let repository = Repository {
            path: PathBuf::from("."),
            gate: Arc::new(Mutex::new(())),
            saved_scope: None,
        };
        let future = repository.execute(Operation::Status);
        let bytes = std::mem::size_of_val(&future);
        assert!(
            bytes <= 256 * 1024,
            "Repository operation future grew to {bytes} bytes; box large workflow boundaries before composing it into CLI/bridge futures"
        );
    }
}
