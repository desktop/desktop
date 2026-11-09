//! Reviewed branch changes, native stash orchestration and durable phase receipts.
mod creation;
pub(super) mod deletion;
use super::Listing;
use crate::{
    ChangesStrategy, GitPath, Repository, args, cancellation, discard_fs as work, process,
};
use anyhow::{Context, Result};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
pub(crate) use deletion::DeletionRequest;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct CreationRequest {
    pub(crate) start_point: Option<String>,
    pub(crate) no_track: bool,
    #[serde(default)]
    pub(crate) track_direct: bool,
    pub(crate) checkout: bool,
}
#[derive(Clone, Deserialize, Serialize)]
struct Creation {
    #[serde(flatten)]
    request: CreationRequest,
    start_ref: Option<String>,
    start_oid: Option<String>,
    #[serde(default)]
    defer_to_switch: bool,
    #[serde(default)]
    name_rules: Option<crate::NameRulesPolicy>,
}
impl Creation {
    fn ensure_name_rules(&self) -> Result<()> {
        if let Some(policy) = &self.name_rules {
            policy.ensure_allowed()?;
        }
        Ok(())
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct Target {
    request: String,
    branch: String,
    reference: String,
    oid: String,
    remote: bool,
    #[serde(default)]
    creation: Option<Creation>,
}
struct Plan {
    view: Value,
    target: Target,
    source_ref: Option<String>,
    source_head: Option<String>,
    stashes: Listing,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u8,
    id: String,
    repository_id: String,
    created_ns: u128,
    source_ref: Option<String>,
    source_head: Option<String>,
    target: Target,
    strategy: ChangesStrategy,
    phase: String,
    stash_message: String,
    saved_oid: Option<String>,
    replaced_oid: Option<String>,
    error: Option<String>,
}
fn ensure_checkout(output: &process::RawOutput) -> Result<()> {
    anyhow::ensure!(
        output.code == 0,
        "Git checkout step failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
fn valid_id(id: &str) -> Result<()> {
    anyhow::ensure!(
        uuid::Uuid::parse_str(id)?.to_string() == id,
        "invalid checkout receipt ID"
    );
    Ok(())
}
fn read_receipt(base: &Path, id: &str) -> Result<Receipt> {
    valid_id(id)?;
    let directory = Dir::open_ambient_dir(base, ambient_authority())?;
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = directory.open_with(format!("{id}.json"), &options)?;
    anyhow::ensure!(
        file.metadata()?.is_file(),
        "checkout receipt must be a regular file"
    );
    let mut bytes = Vec::new();
    file.by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= 1024 * 1024,
        "checkout receipt exceeds supported size"
    );
    let receipt: Receipt = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(
        receipt.version == 1 && receipt.id == id,
        "unsupported checkout receipt"
    );
    Ok(receipt)
}
// Phase writes intentionally finish even if cancellation arrived after a Git
// mutation. The receipt is evidence, never an instruction to replay a command.
async fn write_receipt(base: PathBuf, receipt: Receipt) -> Result<()> {
    tokio::task::spawn_blocking(move || {
        let temporary = base.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
        work::private_write(&temporary, &serde_json::to_vec_pretty(&receipt)?)?;
        let result = fs::rename(&temporary, base.join(format!("{}.json", receipt.id)));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        #[cfg(unix)]
        fs::File::open(&base)?.sync_all()?;
        Ok(())
    })
    .await?
}
impl Repository {
    async fn checkout_directory(&self) -> Result<PathBuf> {
        let base = self.git_directory().await?.join("desktop-checkout");
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&base)?;
        anyhow::ensure!(
            fs::symlink_metadata(&base)?.is_dir()
                && !fs::symlink_metadata(&base)?.file_type().is_symlink(),
            "checkout receipt directory cannot be a symlink"
        );
        Ok(base)
    }
    async fn current_checkout_identity(&self) -> Result<(Option<String>, Option<String>)> {
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        anyhow::ensure!(
            matches!(symbolic.code, 0 | 1),
            "cannot inspect current branch"
        );
        let reference = (symbolic.code == 0)
            .then(|| String::from_utf8(symbolic.stdout))
            .transpose()?
            .map(|s| s.trim_end_matches('\n').to_owned());
        let head = self
            .run(&args(&["rev-parse", "--verify", "--quiet", "HEAD"]))
            .await?;
        anyhow::ensure!(matches!(head.code, 0 | 1), "cannot inspect current HEAD");
        let head = (head.code == 0)
            .then(|| String::from_utf8(head.stdout))
            .transpose()?
            .map(|s| s.trim().to_owned());
        Ok((reference, head))
    }
    async fn checkout_target(&self, request: &str) -> Result<Target> {
        anyhow::ensure!(
            !request.is_empty()
                && !request.starts_with('-')
                && !request.contains(['\0', '\n', '\r']),
            "invalid checkout target"
        );
        let branches = self.branch_list().await?;
        let entries = branches.as_array().context("invalid branch metadata")?;
        let local = request.strip_prefix("refs/heads/").unwrap_or(request);
        if let Some(entry) = entries.iter().find(|entry| {
            !request.starts_with("refs/remotes/")
                && entry["local"] == true
                && entry["name"] == local
        }) {
            self.validate_branch(local).await?;
            return Ok(Target {
                request: request.into(),
                branch: local.into(),
                reference: entry["ref"].as_str().context("missing local ref")?.into(),
                oid: entry["oid"].as_str().context("missing local tip")?.into(),
                remote: false,
                creation: None,
            });
        }
        anyhow::ensure!(
            !request.starts_with("refs/heads/"),
            "Local branch does not exist"
        );
        anyhow::ensure!(
            !request.starts_with("refs/") || request.starts_with("refs/remotes/"),
            "Select a canonical local or remote branch ref"
        );
        let remotes = self.run(&args(&["remote"])).await?;
        ensure_checkout(&remotes)?;
        let remotes = std::str::from_utf8(&remotes.stdout)?
            .lines()
            .collect::<Vec<_>>();
        let mut matches = Vec::new();
        for entry in entries.iter().filter(|entry| entry["local"] == false) {
            let reference = entry["ref"].as_str().context("missing remote ref")?;
            let Some(remote) = remotes
                .iter()
                .filter(|remote| reference.starts_with(&format!("refs/remotes/{remote}/")))
                .max_by_key(|remote| remote.len())
            else {
                continue;
            };
            let name = reference
                .strip_prefix(&format!("refs/remotes/{remote}/"))
                .context("invalid remote branch")?;
            if name == "HEAD" {
                continue;
            }
            if request == reference
                || !request.starts_with("refs/remotes/")
                    && (request == reference.strip_prefix("refs/remotes/").unwrap_or(reference)
                        || request == name)
            {
                matches.push((entry, name, *remote));
            }
        }
        if matches.len() > 1 {
            let preferred = self
                .run(&args(&["config", "--get", "checkout.defaultRemote"]))
                .await?;
            if preferred.code == 0 {
                let preferred = std::str::from_utf8(&preferred.stdout)?.trim_end_matches('\n');
                matches.retain(|(_, _, remote)| *remote == preferred);
            }
        }
        anyhow::ensure!(
            matches.len() == 1,
            "Checkout target is missing or ambiguous; select a canonical local/remote branch"
        );
        let (entry, name, _) = matches[0];
        self.validate_branch(name).await?;
        anyhow::ensure!(
            !entries
                .iter()
                .any(|entry| entry["local"] == true && entry["name"] == name),
            "A local branch already exists for this remote name; select the local branch"
        );
        Ok(Target {
            request: request.into(),
            branch: name.into(),
            reference: entry["ref"].as_str().unwrap_or_default().into(),
            oid: entry["oid"].as_str().unwrap_or_default().into(),
            remote: true,
            creation: None,
        })
    }
    pub(super) async fn checkout_configuration(&self) -> Result<Vec<u8>> {
        let config = crate::process::configuration(
            &self.path,
            &args(&["config", "--null", "--list", "--includes", "--show-origin"]),
        )
        .await?;
        ensure_checkout(&config)?;
        Ok(config.stdout)
    }
    async fn checkout_capture(&self, depth: u8) -> Result<Value> {
        anyhow::ensure!(
            depth <= 8,
            "nested repository depth exceeds checkout review support"
        );
        let snapshot = self.snapshot().await?;
        let index = crate::diff::read_index(&self.index_path().await?)?;
        let (reference, head) = self.current_checkout_identity().await?;
        let mut states = Vec::new();
        let mut attribute_paths = Vec::new();
        for file in &snapshot.files {
            for path in std::iter::once(&file.path).chain(&file.original_path) {
                let checked = work::checked_path(path.clone())?;
                attribute_paths.extend_from_slice(checked.as_encoded_bytes());
                attribute_paths.push(0);
                let target = self.path.join(&checked);
                if fs::symlink_metadata(&target).is_ok_and(|value| value.is_dir()) {
                    let child = Repository::open(&target).await?;
                    anyhow::ensure!(
                        child.path == target.canonicalize()? && child.path != self.path,
                        "changed directory is not a nested repository"
                    );
                    states.push(json!({"path":path,"repository":Box::pin(child.checkout_capture(depth+1)).await?}));
                } else {
                    let root = self.path.clone();
                    let copied = checked.clone();
                    let state = cancellation::blocking(move || {
                        work::capture(
                            &Dir::open_ambient_dir(root, ambient_authority())?,
                            Path::new(&copied),
                            None,
                        )
                    })
                    .await?;
                    states.push(json!({"path":path,"working":state}));
                }
            }
        }
        let attributes = if attribute_paths.is_empty() {
            Vec::new()
        } else {
            let output = process::run_git(
                &self.path,
                &args(&["check-attr", "--all", "-z", "--stdin"]),
                Some(attribute_paths),
                None,
            )
            .await?;
            ensure_checkout(&output)?;
            output.stdout
        };
        let configuration = self.checkout_configuration().await?;
        let operation = crate::discard::operation_certificate(&self.git_directory().await?)?;
        Ok(
            json!({"snapshot":snapshot,"reference":reference,"head":head,"index":index.map(|bytes|format!("{:x}",Sha256::digest(bytes))),"states":states,"attributes":attributes,"configuration":configuration,"operation":operation}),
        )
    }
    async fn checkout_plan(&self, request: &str) -> Result<Plan> {
        let target = self.checkout_target(request).await?;
        self.checkout_plan_for(target).await
    }
    async fn checkout_plan_for(&self, target: Target) -> Result<Plan> {
        if target.remote {
            self.branch_destination_direct(&format!("refs/heads/{}", target.branch))
                .await?;
        }
        let capture = self.checkout_capture(0).await?;
        let (source_ref, source_head) = self.current_checkout_identity().await?;
        let source_branch = source_ref
            .as_deref()
            .and_then(|s| s.strip_prefix("refs/heads/"));
        let stashes = self.stashes().await?;
        let source_stash = stashes
            .entries
            .iter()
            .find(|entry| entry.branch.as_deref() == source_branch && source_branch.is_some());
        let target_stash = stashes
            .entries
            .iter()
            .find(|entry| entry.branch.as_deref() == Some(&target.branch));
        let worktrees = self.worktrees().await?;
        let occupied = worktrees
            .as_array()
            .context("invalid worktree list")?
            .iter()
            .find(|entry| {
                entry["branch"].as_str() == Some(format!("refs/heads/{}", target.branch).as_str())
                    && entry["head"].as_str() != Some("0000000000000000000000000000000000000000")
                    && match serde_json::from_value::<GitPath>(entry["path"].clone()) {
                        Ok(GitPath::Bytes { bytes }) => {
                            crate::os_from_bytes(&bytes).ok().is_some_and(|path| {
                                PathBuf::from(path).canonicalize().ok().as_ref() != Some(&self.path)
                            })
                        }
                        Ok(GitPath::Text(path)) => {
                            PathBuf::from(path).canonicalize().ok().as_ref() != Some(&self.path)
                        }
                        Err(_) => false,
                    }
            });
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(
                &json!({"repository":self.id(),"capture":capture,"target":target,"stashes":stashes.basis,"worktrees":worktrees})
            )?)
        );
        let files = capture["snapshot"]["files"]
            .as_array()
            .context("missing checkout files")?;
        let switching = target
            .creation
            .as_ref()
            .is_none_or(|creation| creation.request.checkout);
        let view = json!({"basis":basis,"name_rules":target.creation.as_ref().and_then(|creation| creation.name_rules.as_ref()),"target":target,"source_branch":source_branch,"source_head":source_head,"dirty":switching&&!files.is_empty(),"files":files,"operation":if switching {capture["snapshot"]["operation"].clone()} else {Value::Null},"conflicted":switching&&files.iter().any(|file|file["conflicted"]==true),"can_leave":source_branch.is_some()&&source_head.is_some(),"same_branch":target.creation.is_none()&&source_ref.as_deref()==Some(format!("refs/heads/{}",target.branch).as_str()),"source_stash":source_stash,"target_stash":target_stash,"occupied_worktree":occupied});
        Ok(Plan {
            view,
            target,
            source_ref,
            source_head,
            stashes,
        })
    }
    pub(crate) async fn checkout_preview(&self, request: &str) -> Result<Value> {
        Ok(self.checkout_plan(request).await?.view)
    }
    async fn checkout_phase(&self, base: &Path, receipt: &mut Receipt, phase: &str) -> Result<()> {
        receipt.phase = phase.into();
        write_receipt(base.to_owned(), receipt.clone()).await
    }
    async fn checkout_target_current(&self, target: &Target) -> Result<()> {
        if target
            .creation
            .as_ref()
            .is_some_and(|creation| creation.defer_to_switch)
            && self.current_checkout_identity().await?.1.is_none()
        {
            return self.creation_preflight(target).await;
        }
        let output = self
            .run(&args(&[
                "show-ref",
                "--verify",
                "--hash",
                &target.reference,
            ]))
            .await?;
        anyhow::ensure!(
            output.code == 0 && std::str::from_utf8(&output.stdout)?.trim() == target.oid,
            "Checkout target changed; review again before switching or removing saved changes"
        );
        Ok(())
    }
    async fn checkout_native(&self, target: &Target) -> Result<process::RawOutput> {
        self.checkout_target_current(target).await?;
        let command = if target.remote {
            args(&[
                "switch",
                "--no-track",
                "-c",
                &target.branch,
                "--",
                &target.oid,
            ])
        } else if let Some(creation) = target
            .creation
            .as_ref()
            .filter(|creation| creation.defer_to_switch)
        {
            let mut command = args(&["-c", "core.warnAmbiguousRefs=false", "switch"]);
            if creation.request.no_track {
                command.push("--no-track".into());
            } else if creation.request.track_direct {
                command.push("--track=direct".into());
            }
            command.extend(args(&["-c", &target.branch, "--"]));
            if !target.oid.is_empty() {
                command.push(creation.start_ref.as_deref().unwrap_or(&target.oid).into());
            }
            command
        } else {
            args(&["switch", "--", &target.branch])
        };
        if target.remote
            || target
                .creation
                .as_ref()
                .is_some_and(|creation| creation.defer_to_switch)
        {
            self.branch_destination_direct(&format!("refs/heads/{}", target.branch))
                .await?;
        }
        process::run_checkout(&self.path, &command).await
    }
    async fn checkout_at_target(&self, target: &Target) -> Result<()> {
        let identity = self.current_checkout_identity().await?;
        anyhow::ensure!(
            identity
                == (
                    Some(format!("refs/heads/{}", target.branch)),
                    (!target.oid.is_empty()).then(|| target.oid.clone())
                ),
            "Branch/HEAD changed during checkout; inspect the current repository before restoring saved changes"
        );
        Ok(())
    }
    async fn checkout_finish_native(
        &self,
        target: &Target,
        base: &Path,
        receipt: &mut Receipt,
    ) -> Result<()> {
        self.checkout_at_target(target).await?;
        self.checkout_phase(base, receipt, "switched").await?;
        if target.remote {
            // This is an already validated canonical refs/remotes name. Git's
            // DWIM lookup must stop at that exact ref, even when a local branch
            // is literally named refs/remotes/REMOTE/NAME. Keep native refspec
            // tracking resolution; the override is scoped to this command.
            let output = process::run_checkout(
                &self.path,
                &args(&[
                    "-c",
                    "core.warnAmbiguousRefs=false",
                    "branch",
                    "--set-upstream-to",
                    &target.reference,
                    "--",
                    &target.branch,
                ]),
            )
            .await?;
            ensure_checkout(&output)?;
        }
        self.checkout_phase(base, receipt, "submodules").await?;
        let output = process::run_checkout(
            &self.path,
            &args(&["submodule", "update", "--init", "--recursive"]),
        )
        .await?;
        ensure_checkout(&output)?;
        self.checkout_at_target(target).await
    }
    async fn checkout_save_changes(&self, base: &Path, receipt: &mut Receipt) -> Result<()> {
        self.checkout_phase(base, receipt, "stashing").await?;
        let result = self
            .stash_save_locked(receipt.stash_message.clone(), true, false)
            .await?;
        receipt.saved_oid = result["oid"].as_str().map(str::to_owned);
        self.checkout_phase(base, receipt, "stashed").await?;
        anyhow::ensure!(
            result["code"] == 0,
            "Git failed while saving changes; the checkout receipt and saved stashes remain available: {}",
            result["stderr"]
        );
        anyhow::ensure!(
            receipt.saved_oid.is_some(),
            "Git did not create a temporary stash; inspect nested repositories and skip-worktree/assume-unchanged flags"
        );
        anyhow::ensure!(
            self.current_checkout_identity().await?
                == (receipt.source_ref.clone(), receipt.source_head.clone()),
            "Source branch/HEAD changed while saving changes; existing stashes were retained"
        );
        self.checkout_target_current(&receipt.target).await?;
        // Never continue if unsaved parent files appeared while native Git stashed.
        let status = self.snapshot().await?;
        let modules = self.submodules().await?;
        let unsaved = status.files.iter().any(|file| {
            !modules.as_array().is_some_and(|modules| {
                modules
                    .iter()
                    .any(|module| module["path"] == json!(file.path))
            })
        });
        anyhow::ensure!(
            !unsaved,
            "Local files remain after stashing; inspect them before switching branches"
        );
        Ok(())
    }
    pub(crate) async fn checkout_reviewed(
        &self,
        request: &str,
        strategy: ChangesStrategy,
        basis: Option<&str>,
        replace: bool,
        restore_index: bool,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let plan = self.checkout_plan(request).await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                plan.view["basis"] == basis,
                "Checkout files, branch, stash list, target or settings changed; review again"
            );
        }
        self.checkout_execute(plan, strategy, replace, restore_index)
            .await
    }
    fn checkout_consent(
        &self,
        plan: &Plan,
        mut strategy: ChangesStrategy,
        replace: bool,
    ) -> Result<(ChangesStrategy, Option<Value>)> {
        if plan.view["same_branch"] == true {
            return Ok((
                strategy,
                Some(json!({"code":0,"stdout":"","stderr":"","unchanged":true})),
            ));
        }
        if !plan.view["occupied_worktree"].is_null() {
            return Ok((
                strategy,
                Some(
                    json!({"code":2,"requires_worktree":true,"preview":plan.view,"stderr":"Open the registered working tree for this branch"}),
                ),
            ));
        }
        anyhow::ensure!(
            plan.view["operation"].is_null() && plan.view["conflicted"] == false,
            "Finish or abort the current operation/conflicts before switching branches"
        );
        if plan.view["can_leave"] == false {
            strategy = ChangesStrategy::MoveToNewBranch;
        }
        if plan.view["dirty"] == true
            && (strategy == ChangesStrategy::AskForConfirmation
                || strategy == ChangesStrategy::StashOnCurrentBranch
                    && !replace
                    && !plan.view["source_stash"].is_null())
        {
            return Ok((
                strategy,
                Some(
                    json!({"code":2,"requires_confirmation":true,"preview":plan.view,"stderr":"Choose whether to leave or bring changes; replacing a previous branch stash requires confirmation"}),
                ),
            ));
        }
        Ok((strategy, None))
    }
    async fn checkout_execute(
        &self,
        plan: Plan,
        strategy: ChangesStrategy,
        replace: bool,
        restore_index: bool,
    ) -> Result<Value> {
        self.checkout_execute_id(
            plan,
            strategy,
            replace,
            restore_index,
            uuid::Uuid::new_v4().to_string(),
        )
        .await
    }
    async fn checkout_execute_id(
        &self,
        plan: Plan,
        strategy: ChangesStrategy,
        replace: bool,
        restore_index: bool,
        id: String,
    ) -> Result<Value> {
        if let Some(creation) = &plan.target.creation {
            creation.ensure_name_rules()?;
        }
        let (strategy, early) = self.checkout_consent(&plan, strategy, replace)?;
        if let Some(result) = early {
            return Ok(result);
        }
        let base = self.checkout_directory().await?;
        let branch = if strategy == ChangesStrategy::StashOnCurrentBranch {
            plan.view["source_branch"]
                .as_str()
                .context("missing source branch")?
        } else {
            &plan.target.branch
        };
        let mut receipt = Receipt {
            version: 1,
            id: id.clone(),
            repository_id: self.id(),
            created_ns: SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos(),
            source_ref: plan.source_ref.clone(),
            source_head: plan.source_head.clone(),
            target: plan.target.clone(),
            strategy,
            phase: "prepared".into(),
            stash_message: format!("Desktop checkout {id} {}", super::message(branch)),
            saved_oid: None,
            replaced_oid: None,
            error: None,
        };
        write_receipt(base.clone(), receipt.clone()).await?;
        let result=async {
            cancellation::Cancellation::current().check()?;
            // Bind the last read to the same reviewed source, before any native mutation.
            let refreshed = self.refresh_checkout_plan(&plan.target).await?;
            if let Some(creation) = &refreshed.target.creation {
                creation.ensure_name_rules()?;
            }
            anyhow::ensure!(refreshed.view["basis"]==plan.view["basis"],"Checkout changed while preparing; review again");
            if let Some(creation) = &plan.target.creation {
                self.checkout_phase(&base,&mut receipt,"creating_branch").await?;
                self.create_branch_native(&plan.target,&base,&receipt.id).await?;
                if !creation.request.checkout {
                    self.checkout_phase(&base,&mut receipt,"complete").await?;
                    return Ok(json!({"code":0,"stdout":"","stderr":"","created":true,"checked_out":false,"receipt_id":receipt.id}));
                }
                anyhow::ensure!(self.current_checkout_identity().await?==(plan.source_ref.clone(),plan.source_head.clone()),"Source changed while creating the branch; inspect its receipt before switching");
            }
            if strategy==ChangesStrategy::StashOnCurrentBranch&&plan.view["dirty"]==true {
                self.checkout_save_changes(&base,&mut receipt).await?;
                if replace&&let Some(previous)=plan.stashes.entries.iter().find(|entry|entry.branch.as_deref()==plan.view["source_branch"].as_str()) {
                    receipt.replaced_oid = Some(previous.oid.clone());
                    self.checkout_phase(&base,&mut receipt,"removing_previous_stash").await?;
                    let listing=self.stashes().await?;
                    if let Some(entry)=listing.entries.iter().find(|entry|entry.oid==previous.oid) {
                        let output=self.stash_drop_checked(&entry.oid,entry.index,&listing.basis).await?;
                        anyhow::ensure!(output["code"]==0,"New stash saved; removing the previous stash failed");receipt.replaced_oid=Some(previous.oid.clone());
                    }
                }
            }
            self.checkout_phase(&base,&mut receipt,"switching").await?;
            let mut switched=self.checkout_native(&plan.target).await?;
            let mut temporary=false;
            if switched.code!=0&&strategy==ChangesStrategy::MoveToNewBranch&&plan.view["dirty"]==true {
                let stderr=String::from_utf8_lossy(&switched.stderr);
                let overwritten=stderr.contains("would be overwritten by checkout")||stderr.contains("would be overwritten by merge")||stderr.contains("would be overwritten by switch");
                anyhow::ensure!(overwritten,"Git checkout failed: {}",stderr);
                anyhow::ensure!(self.current_checkout_identity().await?==(plan.source_ref.clone(),plan.source_head.clone()),"Checkout partly changed HEAD; inspect its receipt before continuing");
                self.checkout_save_changes(&base,&mut receipt).await?;temporary=true;
                self.checkout_phase(&base,&mut receipt,"switching").await?;
                switched=self.checkout_native(&plan.target).await?;
            }
            ensure_checkout(&switched)?;
            self.checkout_finish_native(&plan.target,&base,&mut receipt).await?;
            if temporary {
                self.checkout_phase(&base,&mut receipt,"applying").await?;
                let oid=receipt.saved_oid.as_deref().context("missing temporary stash")?;
                let applied=self.stash_apply_locked(oid,None,None,restore_index,false).await?;
                anyhow::ensure!(applied["code"]==0,"Branch switched; saved changes could not be applied cleanly. Resolve conflicts or restore the retained stash: {}",applied["stderr"]);
                self.checkout_phase(&base,&mut receipt,"applied").await?;
                self.checkout_at_target(&plan.target).await?;
                let listing=self.stashes().await?;
                if let Some(entry)=listing.entries.iter().find(|entry|Some(&entry.oid)==receipt.saved_oid.as_ref()) {
                    self.checkout_phase(&base,&mut receipt,"dropping_transient").await?;
                    let output=self.stash_drop_checked(&entry.oid,entry.index,&listing.basis).await?;
                    anyhow::ensure!(output["code"]==0,"Changes applied; the temporary stash is retained because removal failed");
                }
            }
            self.checkout_phase(&base,&mut receipt,"complete").await?;
            Ok::<_,anyhow::Error>(json!({"code":0,"stdout":switched.text().stdout,"stderr":"","receipt_id":receipt.id,"saved_oid":receipt.saved_oid,"strategy":strategy,"created":plan.target.creation.is_some(),"checked_out":true}))
        }.await;
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                receipt.error = Some(error.to_string().chars().take(4096).collect());
                // Preserve the last attempted phase, which can be uncertain after an
                // OS/process failure. History reconciles the uniquely tagged stash.
                write_receipt(base, receipt.clone()).await?;
                Err(error.context(format!("Checkout {} stopped during {}; inspect checkout history and saved stashes before retrying",receipt.id,receipt.phase)))
            }
        }
    }
    pub(crate) async fn checkout_history(&self) -> Result<Value> {
        let base = self.git_directory().await?.join("desktop-checkout");
        match fs::symlink_metadata(&base) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(json!([])),
            Err(error) => return Err(error.into()),
            Ok(metadata) => anyhow::ensure!(
                metadata.is_dir() && !metadata.file_type().is_symlink(),
                "checkout receipt directory cannot be a symlink"
            ),
        }
        let mut records = Vec::new();
        let listing = self.stashes().await?;
        for entry in fs::read_dir(&base)? {
            let entry = entry?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let Some(id) = name.strip_suffix(".json") else {
                continue;
            };
            if valid_id(id).is_err() {
                continue;
            }
            anyhow::ensure!(
                records.len() < 1000,
                "checkout history exceeds 1000 entries; acknowledge old receipts"
            );
            match read_receipt(&base, id) {
                Ok(receipt) => {
                    anyhow::ensure!(
                        receipt.repository_id == self.id(),
                        "checkout receipt belongs to another working tree"
                    );
                    let saved = listing
                        .entries
                        .iter()
                        .filter(|entry| entry.message.ends_with(&receipt.stash_message))
                        .collect::<Vec<_>>();
                    records.push(json!({"receipt":receipt,"saved_stashes":saved}));
                }
                Err(error) => records.push(json!({"id":id,"error":error.to_string()})),
            }
        }
        records.sort_by_key(|value| {
            std::cmp::Reverse(value["receipt"]["created_ns"].as_u64().unwrap_or_default())
        });
        Ok(json!(records))
    }
    pub(crate) async fn acknowledge_checkout(&self, id: &str) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.checkout_directory().await?;
        let receipt = read_receipt(&base, id)?;
        anyhow::ensure!(
            receipt.repository_id == self.id(),
            "checkout receipt belongs to another working tree"
        );
        super::branch_guard::forget(&base, id)?;
        fs::remove_file(base.join(format!("{id}.json")))?;
        #[cfg(unix)]
        fs::File::open(base)?.sync_all()?;
        Ok(json!({"code":0,"stdout":"","stderr":""}))
    }
}
