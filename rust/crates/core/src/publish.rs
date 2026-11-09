//! Read-only preparation for publishing a local repository to GitHub.
use crate::{
    AccountTarget, PublishPreviewRequest, Repository, RepositoryIdentity, args, cancellation,
    github_api::{self, ChosenAccount, MAX_PAGES, Request, Session},
};
use anyhow::{Context, Result, ensure};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};

impl Repository {
    /// Discover stored accounts without requiring a pre-existing fetch remote.
    pub(crate) async fn publish_context(&self, host: &str) -> Result<Value> {
        crate::github::validate_host(host)?;
        let host = host.to_ascii_lowercase();
        let current = self.account_store_state().await?;
        let remotes = self.publish_remote_witness().await?;
        let origin_exists = remotes.0.split(|b| *b == b'\n').any(|r| r == b"origin");
        let name = self
            .path
            .file_name()
            .context("Repository has no directory name")?
            .to_string_lossy()
            .into_owned();
        let description_path = self.common_directory().await?.join("description");
        let description =
            cancellation::blocking(move || read_description(&description_path)).await?;
        let catalog = github_api::account_catalog(&self.path, &host).await?;
        self.ensure_publish_witness(&current.view.basis, &remotes)
            .await?;
        let (status, accounts, reason) = match catalog {
            Ok(accounts) => ("available", serde_json::to_value(accounts)?, None),
            Err(_) => (
                "unavailable",
                json!([]),
                Some("GitHub account catalog is unavailable"),
            ),
        };
        Ok(
            json!({"host":host,"name":name,"description":description,"private":true,
            "accounts":accounts,"assignment":current.view.assignment,"saved":current.view.saved,
            "origin_exists":origin_exists,"status":status,"reason":reason}),
        )
    }

    // Read private native remote metadata as a witness, never as response data.
    // This does not depend on the unrelated cached repository association.
    async fn publish_remote_witness(&self) -> Result<(Vec<u8>, Vec<u8>)> {
        let names = self.run(&args(&["remote"])).await?;
        let details = self.run(&args(&["remote", "-v"])).await?;
        ensure!(
            names.code == 0 && details.code == 0,
            "Cannot inspect repository remotes"
        );
        Ok((names.stdout, details.stdout))
    }
    async fn ensure_publish_witness(
        &self,
        basis: &str,
        remotes: &(Vec<u8>, Vec<u8>),
    ) -> Result<()> {
        ensure!(
            self.account_store_state().await?.view.basis == basis
                && self.publish_remote_witness().await? == *remotes,
            "Repository account or remotes changed; reload before retrying"
        );
        Ok(())
    }

    /// List organizations for a selected stored or effective account, without
    /// changing gh's active account or consulting a repository remote.
    pub(crate) async fn publish_organizations(
        &self,
        host: &str,
        target: AccountTarget,
    ) -> Result<Value> {
        let (result, _, _, _) = self.publish_organizations_session(host, target).await?;
        Ok(result)
    }

    async fn publish_organizations_session(
        &self,
        host: &str,
        target: AccountTarget,
    ) -> Result<(Value, Session, String, u64)> {
        crate::github::validate_host(host)?;
        let host = host.to_ascii_lowercase();
        let state = self.account_store_state().await?;
        let remotes = self.publish_remote_witness().await?;
        let identity = RepositoryIdentity {
            host: host.clone(),
            owner: "publish-context".into(),
            name: "publish-context".into(),
        };
        let session = match target {
            AccountTarget::Assigned {
                host: target_host,
                login,
            } => {
                ensure!(
                    target_host.eq_ignore_ascii_case(&host),
                    "Selected account host does not match"
                );
                let accounts = github_api::account_catalog(&self.path, &host)
                    .await?
                    .map_err(|_| anyhow::anyhow!("GitHub account catalog is unavailable"))?;
                let candidates: Vec<_> = accounts
                    .iter()
                    .filter(|a| a.login.eq_ignore_ascii_case(&login) && a.state == "success")
                    .collect();
                ensure!(
                    candidates.len() == 1,
                    "Selected GitHub account is unavailable"
                );
                let expected_id = match &state.view.assignment {
                    crate::AccountAssignment::Assigned {
                        host: assigned_host,
                        login: assigned_login,
                        id,
                    } if assigned_host.eq_ignore_ascii_case(&host)
                        && assigned_login.eq_ignore_ascii_case(&login) =>
                    {
                        Some(*id)
                    }
                    _ => None,
                };
                Session::open_for_account(
                    &self.path,
                    &identity,
                    Some(ChosenAccount {
                        host: &host,
                        login: &candidates[0].login,
                        id: expected_id,
                    }),
                )
                .await?
            }
            AccountTarget::Effective {} => Session::open(&self.path, &identity).await?,
            AccountTarget::None {} => {
                anyhow::bail!("Choose a GitHub account before loading organizations")
            }
        }
        .map_err(|_| anyhow::anyhow!("Selected GitHub account is unavailable"))?;
        let actor = session
            .get(Request::User)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
        let actor_id = actor["id"]
            .as_u64()
            .filter(|id| (1..=9_007_199_254_740_991).contains(id))
            .context("Invalid GitHub account")?;
        let actor_login = actor["login"]
            .as_str()
            .filter(|login| {
                !login.is_empty()
                    && login.len() <= 256
                    && login
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_.[]".contains(&b))
            })
            .context("Invalid GitHub account")?
            .to_owned();
        let mut organizations = Vec::new();
        let mut complete = false;
        for page in 1..=MAX_PAGES {
            self.ensure_publish_witness(&state.view.basis, &remotes)
                .await?;
            let value = session
                .get(Request::UserOrganizations { page })
                .await?
                .map_err(|_| anyhow::anyhow!("Cannot load GitHub organizations"))?;
            let rows = value
                .as_array()
                .context("Invalid GitHub organizations response")?;
            for row in rows {
                let login = row["login"]
                    .as_str()
                    .filter(|login| {
                        !login.is_empty()
                            && login.len() <= 256
                            && login
                                .bytes()
                                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
                    })
                    .context("Invalid GitHub organization")?;
                let id = row["id"]
                    .as_u64()
                    .filter(|id| (1..=9_007_199_254_740_991).contains(id))
                    .context("Invalid GitHub organization")?;
                ensure!(
                    !organizations
                        .iter()
                        .any(|(existing, existing_id): &(String, u64)| existing
                            .eq_ignore_ascii_case(login)
                            || *existing_id == id),
                    "Duplicate GitHub organization"
                );
                organizations.push((login.to_owned(), id));
            }
            if rows.len() < 100 {
                complete = true;
                break;
            }
        }
        ensure!(complete, "Too many GitHub organizations to review safely");
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        let fresh = session
            .get(Request::User)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
        ensure!(
            fresh["id"].as_u64() == Some(actor_id)
                && fresh["login"]
                    .as_str()
                    .is_some_and(|login| login.eq_ignore_ascii_case(&actor_login)),
            "GitHub account changed while loading organizations"
        );
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        organizations.sort_by_key(|(login, _)| login.to_ascii_lowercase());
        let result = json!({"organizations":organizations.into_iter().map(|(login,id)| json!({"login":login,"id":id})).collect::<Vec<_>>(),"actor":{"login":actor_login,"id":actor_id},"status":"available","reason":null});
        let encoded = serde_json::to_vec(&result)?;
        let redacted = session.redact_output_for_login(
            crate::process::RawOutput {
                code: 0,
                stdout: encoded.clone(),
                stderr: Vec::new(),
            },
            &actor_login,
        );
        ensure!(
            redacted.stdout == encoded,
            "Cannot safely display GitHub organizations"
        );
        Ok((result, session, actor_login, actor_id))
    }
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct PublishGitWitness {
    physical_directories: Vec<PublishDirectoryIdentity>,
    configuration: Vec<u8>,
    default_branch: Vec<u8>,
    references: Vec<u8>,
    head_ref: Vec<u8>,
    head_oid: Vec<u8>,
    head_ref_code: i32,
    head_oid_code: i32,
}

impl PublishGitWitness {
    fn same_except_configuration(&self, other: &Self) -> bool {
        self.physical_directories == other.physical_directories
            && self.default_branch == other.default_branch
            && self.references == other.references
            && self.head_ref == other.head_ref
            && self.head_oid == other.head_oid
            && self.head_ref_code == other.head_ref_code
            && self.head_oid_code == other.head_oid_code
    }
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct PublishDirectoryIdentity {
    path: Vec<u8>,
    device: u64,
    inode: u64,
}

#[cfg(unix)]
fn publish_directory_identities(
    paths: Vec<std::path::PathBuf>,
) -> Result<Vec<PublishDirectoryIdentity>> {
    use std::os::unix::fs::MetadataExt;
    paths
        .into_iter()
        .map(|path| {
            let canonical = path
                .canonicalize()
                .map_err(|_| anyhow::anyhow!("Cannot verify repository directory identity"))?;
            let metadata = std::fs::metadata(&canonical)
                .map_err(|_| anyhow::anyhow!("Cannot verify repository directory identity"))?;
            ensure!(
                metadata.is_dir(),
                "Cannot verify repository directory identity"
            );
            Ok(PublishDirectoryIdentity {
                path: canonical.as_os_str().as_encoded_bytes().to_vec(),
                device: metadata.dev(),
                inode: metadata.ino(),
            })
        })
        .collect()
}
#[cfg(not(unix))]
fn publish_directory_identities(
    _: Vec<std::path::PathBuf>,
) -> Result<Vec<PublishDirectoryIdentity>> {
    anyhow::bail!("Repository directory identity cannot be verified on this platform")
}

struct PublishPlan {
    view: Value,
    session: Session,
    state_basis: String,
    remotes: (Vec<u8>, Vec<u8>),
    git: PublishGitWitness,
    default_branch: Option<Value>,
    actor_login: String,
    actor_id: u64,
    owner_login: String,
    owner_id: u64,
    organization: bool,
}

struct ContinuePlan {
    view: Value,
    intent: crate::registry::PublicationIntent,
    identity: crate::registry::PublicationIdentity,
    account: crate::registry::SavedRepositoryRecord,
    verified: PublishPlan,
    config: crate::publish_origin::OriginConfigSnapshot,
    effective_config: Vec<u8>,
    clone_url: String,
    is_non_fork: bool,
}

impl Repository {
    async fn publish_git_witness(&self) -> Result<PublishGitWitness> {
        // These private witnesses may contain credentials. Never return or log them.
        let git_dir = self
            .git_directory()
            .await
            .map_err(|_| anyhow::anyhow!("Cannot verify repository directory identity"))?;
        let common_dir = self
            .common_directory()
            .await
            .map_err(|_| anyhow::anyhow!("Cannot verify repository directory identity"))?;
        let paths = vec![self.path().to_owned(), git_dir, common_dir];
        let physical_directories =
            cancellation::blocking(move || publish_directory_identities(paths)).await?;
        let configuration = self
            .run(&args(&[
                "config",
                "--null",
                "--includes",
                "--show-origin",
                "--show-scope",
                "--list",
            ]))
            .await?;
        let default_branch = self
            .run(&args(&[
                "config",
                "--global",
                "--null",
                "--get",
                "init.defaultBranch",
            ]))
            .await?;
        let references = self
            .run(&args(&[
                "for-each-ref",
                "--format=%(refname)%00%(objectname)",
                "refs/heads/",
                "refs/remotes/",
            ]))
            .await?;
        let head_ref = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        let head_oid = self
            .run(&args(&["rev-parse", "--verify", "--quiet", "HEAD"]))
            .await?;
        ensure!(
            configuration.code == 0
                && matches!(default_branch.code, 0 | 1)
                && references.code == 0
                && matches!(head_ref.code, 0 | 1)
                && matches!(head_oid.code, 0 | 1),
            "Cannot inspect repository publication state"
        );
        ensure!(
            configuration.stdout.len() <= 4 * 1024 * 1024
                && references.stdout.len() <= 4 * 1024 * 1024,
            "Repository publication state is too large to review"
        );
        Ok(PublishGitWitness {
            physical_directories,
            configuration: configuration.stdout,
            default_branch: default_branch.stdout,
            references: references.stdout,
            head_ref: head_ref.stdout,
            head_oid: head_oid.stdout,
            head_ref_code: head_ref.code,
            head_oid_code: head_oid.code,
        })
    }

    pub(crate) async fn publish_preview(&self, request: &PublishPreviewRequest) -> Result<Value> {
        Ok(self.publish_preview_plan(request).await?.view)
    }
    /// Review a previously confirmed creation; no local or remote mutation occurs.
    pub(crate) async fn publish_continue_preview(&self, receipt_id: &str) -> Result<Value> {
        Ok(self.publish_continue_plan(receipt_id).await?.view)
    }
    async fn publish_continue_plan(&self, receipt_id: &str) -> Result<ContinuePlan> {
        let path = self.path().to_owned();
        let config = cancellation::blocking(move || crate::publish_origin::capture(&path)).await?;
        let effective_config =
            crate::publish_origin::inspect_semantics(self.path(), &config).await?;
        let intent = self.publish_created_intent(receipt_id).await?;
        let identity = intent
            .identity
            .clone()
            .context("Publication identity is unavailable")?;
        identity.validate()?;
        let clone_url = format!(
            "https://{}/{}/{}.git",
            identity.host, identity.owner, identity.name
        );
        crate::publish_origin::validate_candidate(&config, &clone_url).await?;
        let remote_id = intent
            .remote_id
            .context("Publication identity is unavailable")?;
        let state = self.account_store_state().await?;
        ensure!(
            state.view.saved && state.view.basis == identity.account_basis,
            "Repository account changed since creation; reconcile before continuing"
        );
        let remotes = self.publish_remote_witness().await?;
        ensure!(
            !remotes.0.split(|b| *b == b'\n').any(|r| r == b"origin"),
            "An origin remote exists; reconcile before continuing"
        );
        let git = self.publish_git_witness().await?;
        ensure!(
            directory_fingerprint(&git)? == identity.source_fingerprint,
            "Repository identity changed since creation; reconcile before continuing"
        );
        let default_branch = if remotes.0.is_empty() {
            None
        } else {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine the default branch"))?
                    .default_branch,
            )?)
        };
        let (organizations, session, actor_login, actor_id) = self
            .publish_organizations_session(&identity.host, identity.target.clone())
            .await?;
        ensure!(
            actor_id == identity.actor_id
                && actor_login.eq_ignore_ascii_case(&identity.actor_login),
            "GitHub account changed since creation"
        );
        let organization = !identity.owner.eq_ignore_ascii_case(&identity.actor_login);
        if organization {
            let rows = organizations["organizations"]
                .as_array()
                .context("Invalid organization catalog")?;
            ensure!(
                rows.iter()
                    .any(|row| row["id"].as_u64() == Some(identity.owner_id)
                        && row["login"]
                            .as_str()
                            .is_some_and(|login| login.eq_ignore_ascii_case(&identity.owner))),
                "GitHub organization changed since creation"
            );
        }
        ensure_safe_identity(&session, &actor_login, &identity)?;
        let repository = RepositoryIdentity {
            host: identity.host.to_ascii_lowercase(),
            owner: identity.owner.to_ascii_lowercase(),
            name: identity.name.to_ascii_lowercase(),
        };
        let value = session
            .repository_by_identity(&repository)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify the created GitHub repository"))?;
        let private = value["private"]
            .as_bool()
            .context("Invalid GitHub repository response")?;
        let is_non_fork = value["fork"].as_bool() == Some(false);
        ensure!(
            validate_created_repository(
                &value,
                &identity.host,
                &identity.owner,
                identity.owner_id,
                &identity.name,
                private
            ) == Some(remote_id),
            "Created GitHub repository identity changed"
        );
        let plan = PublishPlan {
            view: Value::Null,
            session,
            state_basis: state.view.basis.clone(),
            remotes,
            git,
            default_branch,
            actor_login,
            actor_id,
            owner_login: identity.owner.clone(),
            owner_id: identity.owner_id,
            organization,
        };
        self.verify_publish_plan(&plan).await?;
        let fresh = self.publish_created_intent(receipt_id).await?;
        ensure!(
            serde_json::to_vec(&fresh)? == serde_json::to_vec(&intent)?,
            "Publication recovery state changed; reload before continuing"
        );
        self.ensure_publish_witness(&plan.state_basis, &plan.remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == plan.git,
            "Repository publication state changed; reload before continuing"
        );
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                &intent,
                &plan.state_basis,
                &plan.remotes,
                &plan.git,
                &plan.default_branch,
                &config,
                &effective_config,
                private,
                is_non_fork,
            ))?)
        );
        let url = format!(
            "https://{}/{}/{}",
            identity.host, identity.owner, identity.name
        );
        let path = self.path().to_owned();
        ensure!(
            cancellation::blocking(move || crate::publish_origin::capture(&path)).await? == config,
            "Git configuration changed; reload before continuing"
        );
        ensure!(
            crate::publish_origin::inspect_semantics(self.path(), &config).await?
                == effective_config,
            "Git configuration changed; reload before continuing"
        );
        let reason = if is_non_fork {
            "This step adds origin and associates the account; pushing is not implemented."
        } else {
            "The repository is not verified as a non-fork; continuing is unavailable."
        };
        let result = json!({"basis":basis,"phase":"created","url":url,
            "actor":{"login":identity.actor_login,"id":identity.actor_id},
            "owner":{"login":identity.owner,"id":identity.owner_id},"private":private,
            "can_continue":is_non_fork,"reason":reason});
        let encoded = serde_json::to_vec(&result)?;
        let redacted = plan.session.redact_output_for_login(
            crate::process::RawOutput {
                code: 0,
                stdout: encoded.clone(),
                stderr: Vec::new(),
            },
            &plan.actor_login,
        );
        ensure!(
            redacted.stdout == encoded,
            "Cannot safely display publication review"
        );
        let account = state
            .record
            .context("Saved repository account is unavailable")?;
        Ok(ContinuePlan {
            view: result,
            intent,
            identity,
            account,
            verified: plan,
            config,
            effective_config,
            clone_url,
            is_non_fork,
        })
    }

    async fn verify_continue_remote(&self, plan: &ContinuePlan) -> Result<()> {
        let identity = &plan.identity;
        let repository = RepositoryIdentity {
            host: identity.host.to_ascii_lowercase(),
            owner: identity.owner.to_ascii_lowercase(),
            name: identity.name.to_ascii_lowercase(),
        };
        let value = plan
            .verified
            .session
            .repository_by_identity(&repository)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify the created GitHub repository"))?;
        let private = value["private"]
            .as_bool()
            .context("Invalid GitHub repository response")?;
        ensure!(
            plan.view["private"].as_bool() == Some(private)
                && value["fork"].as_bool() == Some(false)
                && validate_created_repository(
                    &value,
                    &identity.host,
                    &identity.owner,
                    identity.owner_id,
                    &identity.name,
                    private
                ) == plan.intent.remote_id,
            "Created GitHub repository identity changed"
        );
        Ok(())
    }

    /// Prove that the exact reviewed origin is the only local configuration change.
    async fn verify_added_origin(
        &self,
        plan: &ContinuePlan,
    ) -> Result<(
        crate::repository_context::Binding,
        crate::publish_origin::OriginConfigSnapshot,
    )> {
        crate::publication_config_preflight(self.path()).await?;
        let path = self.path().to_owned();
        let snapshot =
            cancellation::blocking(move || crate::publish_origin::capture(&path)).await?;
        ensure!(
            plan.config.matches_added_origin(&snapshot, &plan.clone_url),
            "Git configuration changed; inspect publication history"
        );
        crate::publish_origin::inspect_added_origin(
            self.path(),
            &plan.effective_config,
            &plan.clone_url,
        )
        .await?;
        ensure!(
            self.account_store_state().await?.view.basis == plan.verified.state_basis,
            "Repository account changed; inspect publication history"
        );
        let remotes = self.publish_remote_witness().await?;
        ensure!(
            remotes_with_only_added_origin(&plan.verified.remotes, &remotes, &plan.clone_url),
            "Repository remotes changed; inspect publication history"
        );
        let git = self.publish_git_witness().await?;
        ensure!(
            plan.verified.git.same_except_configuration(&git),
            "Repository state changed; inspect publication history"
        );
        let binding = self.fetch_binding(Some("origin".into())).await?;
        let expected = RepositoryIdentity {
            host: plan.identity.host.to_ascii_lowercase(),
            owner: plan.identity.owner.to_ascii_lowercase(),
            name: plan.identity.name.to_ascii_lowercase(),
        };
        ensure!(
            binding.remote.as_deref() == Some("origin")
                && binding.identity.as_ref() == Some(&expected),
            "Origin destination changed; inspect publication history"
        );
        let path = self.path().to_owned();
        ensure!(
            cancellation::blocking(move || crate::publish_origin::capture(&path)).await?
                == snapshot,
            "Git configuration changed; inspect publication history"
        );
        Ok((binding, snapshot))
    }

    pub(crate) async fn publish_continue(
        &self,
        receipt_id: &str,
        basis: &str,
        acknowledge_partial: bool,
    ) -> Result<Value> {
        ensure!(
            acknowledge_partial,
            "Acknowledge that pushing is not implemented"
        );
        let _lock = self.stash_lock().await?;
        let plan = self.publish_continue_plan(receipt_id).await?;
        ensure!(
            plan.view["basis"] == basis,
            "Publication review changed; reload before continuing"
        );
        ensure!(
            plan.is_non_fork,
            "The created repository is not verified as a non-fork"
        );
        // Persist an uncertain phase before touching Git configuration.
        let mut intent = self
            .transition_publish_intent(&plan.intent, &plan.account, "origin_unknown")
            .await?;
        let result: Result<()> = async {
            let path = self.path().to_owned();
            let config = plan.config.clone();
            let lock = cancellation::blocking(move || {
                crate::publish_origin::OriginLock::acquire(&path, &config)
            })
            .await?;
            self.verify_publish_plan(&plan.verified).await?;
            self.verify_continue_remote(&plan).await?;
            crate::publication_config_preflight(self.path()).await?;
            ensure!(
                crate::publish_origin::inspect_semantics(self.path(), &plan.config).await?
                    == plan.effective_config,
                "Git configuration changed; inspect publication history"
            );
            let path = self.path().to_owned();
            let config = plan.config.clone();
            let url = plan.clone_url.clone();
            cancellation::blocking(move || lock.commit(&path, &config, &url)).await?;
            let (binding, post_config) = self.verify_added_origin(&plan).await?;
            self.verify_publish_actor(&plan.verified).await?;
            self.verify_continue_remote(&plan).await?;
            let (fresh_binding, fresh_config) = self.verify_added_origin(&plan).await?;
            ensure!(
                binding.fingerprint == fresh_binding.fingerprint && post_config == fresh_config,
                "Origin changed; inspect publication history"
            );
            intent = self
                .transition_publish_intent(&intent, &plan.account, "origin_added")
                .await?;
            intent = self
                .transition_publish_intent(&intent, &plan.account, "assignment_unknown")
                .await?;
            let path = self.path().to_owned();
            let expected = post_config.clone();
            let _config_lock = cancellation::blocking(move || {
                crate::publish_origin::OriginLock::acquire(&path, &expected)
            })
            .await?;
            self.verify_publish_actor(&plan.verified).await?;
            self.verify_continue_remote(&plan).await?;
            let (final_binding, final_config) = self.verify_added_origin(&plan).await?;
            ensure!(
                binding.fingerprint == final_binding.fingerprint && post_config == final_config,
                "Origin changed; inspect publication history"
            );
            let mut replacement = plan.account.account.clone();
            replacement.revision = replacement
                .revision
                .checked_add(1)
                .context("Account revision overflow")?;
            replacement.assignment = match &plan.identity.target {
                AccountTarget::Effective {} => crate::AccountAssignment::Effective {},
                AccountTarget::Assigned { .. } => crate::AccountAssignment::Assigned {
                    host: plan.identity.host.clone(),
                    login: plan.identity.actor_login.clone(),
                    id: plan.identity.actor_id,
                },
                AccountTarget::None {} => anyhow::bail!("Publication account is unavailable"),
            };
            replacement.source_remote = Some("origin".into());
            replacement.association = Some(crate::ScopedAssociation {
                remote_name: Some("origin".into()),
                fingerprint: binding.fingerprint,
                metadata: crate::RepositoryMetadata {
                    identity: RepositoryIdentity {
                        host: plan.identity.host.to_ascii_lowercase(),
                        owner: plan.identity.owner.to_ascii_lowercase(),
                        name: plan.identity.name.to_ascii_lowercase(),
                    },
                    is_fork: false,
                    parent: None,
                    updated_at_secs: std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)?
                        .as_secs(),
                },
            });
            self.assign_publish_account(&intent, &plan.account, replacement, &post_config)
                .await?;
            Ok(())
        }
        .await;
        match result {
            Ok(()) => Ok(json!({"phase":"account_assigned","receipt_id":receipt_id,
                "url":plan.view["url"],"error":null,"message":"Origin and account are configured; pushing is not implemented"})),
            Err(_) => {
                cancellation::Cancellation::current().check()?;
                let safe = crate::publication_config_preflight(self.path())
                    .await
                    .is_ok();
                cancellation::Cancellation::current().check()?;
                let phase = if safe {
                    self.publication_intent_phase(receipt_id)
                        .await
                        .ok()
                        .flatten()
                } else {
                    None
                }
                .unwrap_or_else(|| "state_unknown".into());
                cancellation::Cancellation::current().check()?;
                Ok(json!({"phase":phase,"receipt_id":receipt_id,"url":null,
                    "error":"Publication stopped; inspect recovery history before taking further action"}))
            }
        }
    }

    pub(crate) async fn publish_create(
        &self,
        request: &PublishPreviewRequest,
        basis: &str,
        acknowledge_partial: bool,
    ) -> Result<Value> {
        ensure!(
            acknowledge_partial,
            "Acknowledge that only the remote repository will be created"
        );
        let _lock = self.stash_lock().await?;
        let initial = self.publish_preview_plan(request).await?;
        ensure!(
            initial.view["basis"] == basis,
            "Publication review changed; reload before retrying"
        );
        ensure!(
            initial.view["can_create"] == true,
            "Publication recovery is unavailable or a previous creation is unresolved"
        );
        let identity = crate::registry::PublicationIdentity {
            host: request.host.to_ascii_lowercase(),
            owner: initial.owner_login.clone(),
            name: request.name.clone(),
            actor_login: initial.actor_login.clone(),
            actor_id: initial.actor_id,
            owner_id: initial.owner_id,
            target: request.target.clone(),
            account_basis: initial.state_basis.clone(),
            source_fingerprint: directory_fingerprint(&initial.git)?,
        };
        identity.validate()?;
        ensure_safe_identity(&initial.session, &initial.actor_login, &identity)?;
        let id = self.prepare_publish_receipt(identity).await?;
        // A persisted unknown outcome always blocks replay, even if revalidation fails before the POST.
        let plan = match self.publish_preview_plan(request).await {
            Ok(plan) if plan.view["basis"] == basis => plan,
            _ => {
                cancellation::Cancellation::current().check()?;
                return Ok(unknown_creation(
                    &id,
                    "Publication state changed before creation; inspect recovery history",
                ));
            }
        };
        if self.verify_publish_plan(&plan).await.is_err()
            || self.ensure_publish_receipt(&id).await.is_err()
        {
            cancellation::Cancellation::current().check()?;
            return Ok(unknown_creation(
                &id,
                "Publication state changed before creation; inspect recovery history",
            ));
        }
        cancellation::Cancellation::current().mark_remote_mutation();
        let response = match plan
            .session
            .create_repository(
                &plan.owner_login,
                &request.name,
                &request.description,
                request.private,
                plan.organization,
            )
            .await
        {
            Ok(Ok(value)) => value,
            Ok(Err(_)) => {
                cancellation::Cancellation::current().check()?;
                return Ok(unknown_creation(
                    &id,
                    "Repository creation was not confirmed; inspect recovery history",
                ));
            }
            Err(_) => {
                cancellation::Cancellation::current().check()?;
                return Ok(unknown_creation(
                    &id,
                    "Repository creation was interrupted; inspect recovery history",
                ));
            }
        };
        let Some(remote_id) = validate_created_repository(
            &response,
            &request.host,
            &plan.owner_login,
            plan.owner_id,
            &request.name,
            request.private,
        ) else {
            cancellation::Cancellation::current().check()?;
            return Ok(unknown_creation(
                &id,
                "Repository creation response was not verified; inspect recovery history",
            ));
        };
        match self.finish_publish_receipt(&id, remote_id).await {
            Ok(_) => Ok(json!({"phase":"created","receipt_id":id,"url":null,
                "error":"The remote repository was created; origin and pushes are not implemented"})),
            Err(_) => {
                cancellation::Cancellation::current().check()?;
                Ok(unknown_creation(
                    &id,
                    "Repository creation was received but recovery storage failed; inspect history",
                ))
            }
        }
    }

    async fn verify_publish_actor(&self, plan: &PublishPlan) -> Result<()> {
        let actor = plan
            .session
            .get(Request::User)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
        ensure!(
            actor["id"].as_u64() == Some(plan.actor_id)
                && actor["login"]
                    .as_str()
                    .is_some_and(|login| login.eq_ignore_ascii_case(&plan.actor_login)),
            "GitHub account changed"
        );
        if plan.organization {
            let mut found = false;
            let mut complete = false;
            for page in 1..=MAX_PAGES {
                let value = plan
                    .session
                    .get(Request::UserOrganizations { page })
                    .await?
                    .map_err(|_| anyhow::anyhow!("Cannot verify GitHub organization"))?;
                let rows = value.as_array().context("Invalid organization catalog")?;
                for row in rows {
                    let same_name = row["login"]
                        .as_str()
                        .is_some_and(|login| login.eq_ignore_ascii_case(&plan.owner_login));
                    let same_id = row["id"].as_u64() == Some(plan.owner_id);
                    if same_name || same_id {
                        ensure!(
                            same_name && same_id && !found,
                            "GitHub organization changed"
                        );
                        found = true;
                    }
                }
                if rows.len() < 100 {
                    complete = true;
                    break;
                }
            }
            ensure!(complete && found, "GitHub organization changed");
            let actor = plan
                .session
                .get(Request::User)
                .await?
                .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
            ensure!(
                actor["id"].as_u64() == Some(plan.actor_id)
                    && actor["login"]
                        .as_str()
                        .is_some_and(|login| login.eq_ignore_ascii_case(&plan.actor_login)),
                "GitHub account changed"
            );
        }
        Ok(())
    }

    async fn verify_publish_plan(&self, plan: &PublishPlan) -> Result<()> {
        self.verify_publish_actor(plan).await?;
        self.ensure_publish_witness(&plan.state_basis, &plan.remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == plan.git,
            "Repository publication state changed"
        );
        let current_default = if plan.remotes.0.is_empty() {
            None
        } else {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine default branch"))?
                    .default_branch,
            )?)
        };
        ensure!(
            current_default == plan.default_branch,
            "Default branch changed"
        );
        self.ensure_publish_witness(&plan.state_basis, &plan.remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == plan.git,
            "Repository publication state changed"
        );
        Ok(())
    }

    async fn publish_preview_plan(&self, request: &PublishPreviewRequest) -> Result<PublishPlan> {
        crate::github::validate_host(&request.host)?;
        crate::github::validate_repository(&format!("{}/{}", request.owner, request.name))?;
        ensure!(
            request.name.len() <= 100 && request.owner.len() <= 256,
            "Invalid repository name or owner"
        );
        crate::github::validate_text(&request.description)?;
        let state = self.account_store_state().await?;
        ensure!(state.view.saved, "Save the repository before publishing");
        let remotes = self.publish_remote_witness().await?;
        ensure!(
            !remotes.0.split(|b| *b == b'\n').any(|r| r == b"origin"),
            "An origin remote already exists"
        );
        let git = self.publish_git_witness().await?;
        let has_remotes = !remotes.0.is_empty();
        let default_branch = if has_remotes {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine the default branch"))?
                    .default_branch,
            )?)
        } else {
            None
        };
        let (organizations, session, actor_login, actor_id) = self
            .publish_organizations_session(&request.host, request.target.clone())
            .await?;
        let (owner_login, owner_id, owner_kind) =
            if request.owner.eq_ignore_ascii_case(&actor_login) {
                (actor_login.clone(), actor_id, "personal")
            } else {
                let rows = organizations["organizations"]
                    .as_array()
                    .context("Invalid organization catalog")?;
                let row = rows
                    .iter()
                    .find(|row| {
                        row["login"]
                            .as_str()
                            .is_some_and(|login| login.eq_ignore_ascii_case(&request.owner))
                    })
                    .context("Selected organization is unavailable")?;
                (
                    row["login"]
                        .as_str()
                        .context("Invalid organization")?
                        .to_owned(),
                    row["id"].as_u64().context("Invalid organization")?,
                    "organization",
                )
            };
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == git,
            "Repository publication state changed; reload before retrying"
        );
        let fresh_default_branch = if has_remotes {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine the default branch"))?
                    .default_branch,
            )?)
        } else {
            None
        };
        ensure!(
            fresh_default_branch == default_branch,
            "Default branch changed; reload before retrying"
        );
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == git,
            "Repository publication state changed; reload before retrying"
        );
        let (push_status, pushes) = publish_push_plan(&git, default_branch.as_ref())?;
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                request,
                &state.view.basis,
                &remotes,
                &git,
                &default_branch,
                &actor_login,
                actor_id,
                &owner_login,
                owner_id,
                owner_kind,
            ))?)
        );
        let can_create = match self.publish_creation_available().await {
            Ok(available) => available,
            Err(_) => {
                cancellation::Cancellation::current().check()?;
                false
            }
        };
        let create_reason = if can_create {
            "Only the remote repository can be created; origin and pushes are not implemented. An attempt blocks further attempts even after acknowledgement; reconciliation and recovery of its URL are not implemented. Permissions and name availability are not verified."
        } else {
            "Creation is unavailable because recovery storage is unsafe or a previous creation is unresolved. Origin and pushes are not implemented."
        };
        let result = json!({"basis":basis,"can_apply":false,"reason":"Full publication is not implemented yet",
            "can_create":can_create,"create_reason":create_reason,
            "actor":{"login":actor_login,"id":actor_id},
            "owner":{"login":owner_login,"id":owner_id,"kind":owner_kind},
            "pushes":pushes,"push_status":push_status});
        let encoded = serde_json::to_vec(&result)?;
        let redacted = session.redact_output_for_login(
            crate::process::RawOutput {
                code: 0,
                stdout: encoded.clone(),
                stderr: Vec::new(),
            },
            &actor_login,
        );
        ensure!(
            redacted.stdout == encoded,
            "Cannot safely display publication review"
        );
        Ok(PublishPlan {
            view: result,
            session,
            state_basis: state.view.basis,
            remotes,
            git,
            default_branch,
            actor_login,
            actor_id,
            owner_login,
            owner_id,
            organization: owner_kind == "organization",
        })
    }
}

fn remotes_with_only_added_origin(
    before: &(Vec<u8>, Vec<u8>),
    after: &(Vec<u8>, Vec<u8>),
    url: &str,
) -> bool {
    fn partition(bytes: &[u8], marker: &[u8]) -> (Vec<u8>, Vec<u8>) {
        let mut other = Vec::new();
        let mut origin = Vec::new();
        for line in bytes.split_inclusive(|b| *b == b'\n') {
            if line.starts_with(marker) {
                origin.extend_from_slice(line);
            } else {
                other.extend_from_slice(line);
            }
        }
        (other, origin)
    }
    let (names, origin_names) = partition(&after.0, b"origin\n");
    let (details, origin_details) = partition(&after.1, b"origin\t");
    names == before.0
        && details == before.1
        && origin_names == b"origin\n"
        && origin_details == format!("origin\t{url} (fetch)\norigin\t{url} (push)\n").as_bytes()
}

fn directory_fingerprint(git: &PublishGitWitness) -> Result<String> {
    Ok(format!(
        "{:x}",
        Sha256::digest(serde_json::to_vec(&git.physical_directories)?)
    ))
}

fn ensure_safe_identity(
    session: &Session,
    actor_login: &str,
    identity: &crate::registry::PublicationIdentity,
) -> Result<()> {
    let url = format!(
        "https://{}/{}/{}",
        identity.host, identity.owner, identity.name
    );
    let encoded = serde_json::to_vec(&(identity, url))?;
    let output = session.redact_output_for_login(
        crate::process::RawOutput {
            code: 0,
            stdout: encoded.clone(),
            stderr: Vec::new(),
        },
        actor_login,
    );
    ensure!(
        output.stdout == encoded,
        "Cannot safely store publication identity"
    );
    Ok(())
}

fn unknown_creation(id: &str, error: &'static str) -> Value {
    json!({"phase":"creation_unknown","receipt_id":id,"url":null,"error":error})
}

fn validate_created_repository(
    value: &Value,
    host: &str,
    owner: &str,
    owner_id: u64,
    name: &str,
    private: bool,
) -> Option<u64> {
    let id = value["id"]
        .as_u64()
        .filter(|id| (1..=9_007_199_254_740_991).contains(id))?;
    let full_name = format!("{owner}/{name}");
    let html = format!("https://{host}/{full_name}");
    let clone = format!("{html}.git");
    (value["name"]
        .as_str()
        .is_some_and(|v| v.eq_ignore_ascii_case(name))
        && value["full_name"]
            .as_str()
            .is_some_and(|v| v.eq_ignore_ascii_case(&full_name))
        && value["owner"]["login"]
            .as_str()
            .is_some_and(|v| v.eq_ignore_ascii_case(owner))
        && value["owner"]["id"].as_u64() == Some(owner_id)
        && value["private"].as_bool() == Some(private)
        && value["html_url"]
            .as_str()
            .is_some_and(|v| v.eq_ignore_ascii_case(&html))
        && value["clone_url"]
            .as_str()
            .is_some_and(|v| v.eq_ignore_ascii_case(&clone)))
    .then_some(id)
}

fn publish_push_plan(
    git: &PublishGitWitness,
    selected_default: Option<&Value>,
) -> Result<(&'static str, Vec<Value>)> {
    if git.head_oid_code != 0 {
        return Ok(("unborn", Vec::new()));
    }
    if git.head_ref_code != 0 {
        return Ok(("detached", Vec::new()));
    }
    let head = std::str::from_utf8(&git.head_ref)?
        .strip_suffix('\n')
        .context("Invalid HEAD reference")?;
    let branch = head
        .strip_prefix("refs/heads/")
        .context("HEAD does not reference a local branch")?;
    let oid = std::str::from_utf8(&git.head_oid)?
        .strip_suffix('\n')
        .context("Invalid HEAD object")?;
    ensure!(
        !oid.is_empty() && oid.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid HEAD object"
    );
    let default_name = if git.default_branch.is_empty() {
        "main"
    } else {
        std::str::from_utf8(
            git.default_branch
                .strip_suffix(&[0])
                .context("Invalid default branch")?,
        )?
    };
    let fallback_ref = format!("refs/heads/{default_name}");
    let chosen = match selected_default {
        None => Some((default_name, fallback_ref.as_str())),
        Some(Value::Null) => None,
        Some(value) => Some((
            value["name"].as_str().context("Invalid default branch")?,
            value["reference"]
                .as_str()
                .context("Invalid default branch")?,
        )),
    };
    let mut pushes = Vec::new();
    for row in git
        .references
        .split(|b| *b == b'\n')
        .filter(|row| !row.is_empty())
    {
        let separator = row
            .iter()
            .position(|b| *b == 0)
            .context("Invalid local branch data")?;
        let reference = &row[..separator];
        let value = &row[separator + 1..];
        if let Some((default_name, default_ref)) = chosen
            && reference == default_ref.as_bytes()
            && default_name != branch
        {
            let value = std::str::from_utf8(value)?;
            ensure!(
                !value.is_empty() && value.bytes().all(|b| b.is_ascii_hexdigit()),
                "Invalid branch object"
            );
            pushes.push(json!({"branch":default_name,"oid":value,"role":"default"}));
        }
    }
    pushes.push(json!({"branch":branch,"oid":oid,"role":"current"}));
    Ok(("planned", pushes))
}

fn read_description(path: &Path) -> Result<String> {
    let Some(parent) = path.parent() else {
        return Ok(String::new());
    };
    let directory = match Dir::open_ambient_dir(parent, ambient_authority()) {
        Ok(dir) => dir,
        Err(_) => return Ok(String::new()),
    };
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = match directory.open_with("description", &options) {
        Ok(file) if file.metadata()?.is_file() => file,
        _ => return Ok(String::new()),
    };
    let mut bytes = Vec::new();
    file.by_ref().take(65537).read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= 65536,
        "Repository description exceeds 64 KiB"
    );
    let value = String::from_utf8_lossy(&bytes).into_owned();
    Ok(
        if value == "Unnamed repository; edit this file 'description' to name the repository.\n" {
            String::new()
        } else {
            value
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn added_origin_proof_rejects_extra_or_changed_destinations() {
        let before = (b"upstream\n".to_vec(), b"upstream\thttps://example.test/a/b.git (fetch)\nupstream\thttps://example.test/a/b.git (push)\n".to_vec());
        let url = "https://github.com/alice/repo.git";
        let after = (
            b"origin\nupstream\n".to_vec(),
            format!(
                "origin\t{url} (fetch)\norigin\t{url} (push)\n{}",
                String::from_utf8_lossy(&before.1)
            )
            .into_bytes(),
        );
        assert!(remotes_with_only_added_origin(&before, &after, url));
        let mut changed = after.clone();
        changed
            .1
            .extend_from_slice(b"origin\thttps://wrong.invalid (push)\n");
        assert!(!remotes_with_only_added_origin(&before, &changed, url));
        let mut changed = after;
        changed.0.extend_from_slice(b"other\n");
        assert!(!remotes_with_only_added_origin(&before, &changed, url));
    }

    #[test]
    #[cfg(unix)]
    fn directory_witness_changes_when_same_path_is_replaced() {
        let base = std::env::temp_dir().join(format!("publish-identity-{}", uuid::Uuid::new_v4()));
        let original = base.join("repository");
        std::fs::create_dir_all(&original).unwrap();
        let before = publish_directory_identities(vec![original.clone()]).unwrap();
        std::fs::rename(&original, base.join("old-repository")).unwrap();
        std::fs::create_dir(&original).unwrap();
        let after = publish_directory_identities(vec![original]).unwrap();
        assert!(before != after);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn creation_response_binds_owner_identity_visibility_and_exact_https_urls() {
        let mut value = json!({"id":123,"name":"project","full_name":"alice/project",
            "owner":{"login":"alice","id":42},"private":true,
            "html_url":"https://github.com/alice/project",
            "clone_url":"https://github.com/alice/project.git"});
        assert_eq!(
            validate_created_repository(&value, "github.com", "alice", 42, "project", true),
            Some(123)
        );
        for (key, bad) in [
            ("id", json!(0)),
            ("name", json!("other")),
            ("full_name", json!("mallory/project")),
            ("private", json!(false)),
            ("html_url", json!("https://alice@github.com/alice/project")),
            (
                "clone_url",
                json!("https://github.com/alice/project.git?token=secret"),
            ),
        ] {
            let previous = value[key].clone();
            value[key] = bad;
            assert!(
                validate_created_repository(&value, "github.com", "alice", 42, "project", true)
                    .is_none()
            );
            value[key] = previous;
        }
        value["owner"]["id"] = json!(43);
        assert!(
            validate_created_repository(&value, "github.com", "alice", 42, "project", true)
                .is_none()
        );
    }

    #[test]
    fn push_review_preserves_default_order_and_skips_unborn_or_detached() {
        let mut git = PublishGitWitness {
            physical_directories: Vec::new(),
            configuration: Vec::new(),
            default_branch: b"main\0".to_vec(),
            references: b"refs/heads/main\0abcd\nrefs/heads/topic\0beef\n".to_vec(),
            head_ref: b"refs/heads/topic\n".to_vec(),
            head_oid: b"beef\n".to_vec(),
            head_ref_code: 0,
            head_oid_code: 0,
        };
        let (status, pushes) = publish_push_plan(&git, None).unwrap();
        assert_eq!(status, "planned");
        assert_eq!(
            pushes,
            vec![
                json!({"branch":"main","oid":"abcd","role":"default"}),
                json!({"branch":"topic","oid":"beef","role":"current"})
            ]
        );
        let chosen = json!({"name":"tracked","reference":"refs/heads/tracked","local":true});
        git.references
            .extend_from_slice(b"refs/heads/tracked\0cafe\n");
        let selected = publish_push_plan(&git, Some(&chosen)).unwrap().1;
        assert_eq!(
            selected[0],
            json!({"branch":"tracked","oid":"cafe","role":"default"})
        );
        let no_default = publish_push_plan(&git, Some(&Value::Null)).unwrap().1;
        assert_eq!(no_default.len(), 1);
        git.head_ref = b"refs/heads/main\n".to_vec();
        git.head_oid = b"abcd\n".to_vec();
        assert_eq!(publish_push_plan(&git, None).unwrap().1.len(), 1);
        git.head_ref_code = 1;
        assert_eq!(publish_push_plan(&git, None).unwrap(), ("detached", vec![]));
        git.head_oid_code = 1;
        assert_eq!(publish_push_plan(&git, None).unwrap(), ("unborn", vec![]));
    }

    #[test]
    fn descriptions_preserve_user_text_and_never_follow_links_or_wait_for_fifos() {
        let root = std::env::temp_dir().join(format!(
            "desktop-publish-description-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        let description = root.join("description");
        std::fs::write(&description, "  custom description  \n\n").unwrap();
        assert_eq!(
            read_description(&description).unwrap(),
            "  custom description  \n\n"
        );
        std::fs::write(
            &description,
            "Unnamed repository; edit this file 'description' to name the repository.\n",
        )
        .unwrap();
        assert_eq!(read_description(&description).unwrap(), "");
        #[cfg(unix)]
        {
            use std::{ffi::CString, os::unix::fs::symlink};
            std::fs::remove_file(&description).unwrap();
            let outside = root.join("private");
            std::fs::write(&outside, "PRIVATE-MARKER").unwrap();
            symlink(&outside, &description).unwrap();
            assert_eq!(read_description(&description).unwrap(), "");
            std::fs::remove_file(&description).unwrap();
            let name = CString::new(description.as_os_str().as_encoded_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
            assert_eq!(read_description(&description).unwrap(), "");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
