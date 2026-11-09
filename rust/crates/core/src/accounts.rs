//! Saved-record account choices, independent of common Git-directory preferences.
use crate::{Repository, RepositoryIdentity, RepositoryMetadata, cancellation};
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum AccountAssignment {
    Effective {},
    None {},
    Assigned {
        host: String,
        login: String,
        id: u64,
    },
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(tag = "mode", rename_all = "snake_case", deny_unknown_fields)]
pub enum AccountTarget {
    Effective {},
    None {},
    Assigned { host: String, login: String },
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ScopedAssociation {
    pub remote_name: Option<String>,
    pub fingerprint: String,
    pub metadata: RepositoryMetadata,
}
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct StoredAccount {
    pub revision: u64,
    pub assignment: AccountAssignment,
    pub association: Option<ScopedAssociation>,
    #[serde(default)]
    pub source_remote: Option<String>,
}
#[derive(Clone, Debug, Serialize)]
pub struct RepositoryAccount {
    pub basis: String,
    pub scope_id: Option<String>,
    pub saved: bool,
    pub revision: u64,
    pub assignment: AccountAssignment,
    pub scoped_metadata: bool,
}
fn digest(value: &impl Serialize) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}
fn validate_identity(host: &str, login: &str) -> Result<()> {
    RepositoryIdentity {
        host: host.into(),
        owner: "owner".into(),
        name: "repository".into(),
    }
    .validate()?;
    anyhow::ensure!(
        !login.is_empty()
            && login.len() <= 256
            && !login.starts_with('-')
            && !matches!(login, "." | "..")
            && login
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b"-_.[]".contains(&b)),
        "Invalid repository account login"
    );
    Ok(())
}
impl StoredAccount {
    pub(crate) fn scoped(&self) -> bool {
        self.revision > 0 || !matches!(self.assignment, AccountAssignment::Effective {})
    }
    pub(crate) fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            self.source_remote
                .as_ref()
                .is_none_or(|name| !name.is_empty()
                    && name.len() <= 4096
                    && !name.contains(['\0', '\n', '\r'])),
            "Invalid saved account source remote"
        );
        if let AccountAssignment::Assigned { host, login, id } = &self.assignment {
            validate_identity(host, login)?;
            anyhow::ensure!(
                *id > 0 && *id <= 9_007_199_254_740_991,
                "Invalid repository account actor ID"
            );
        }
        if let Some(association) = &self.association {
            anyhow::ensure!(
                !matches!(self.assignment, AccountAssignment::None {}),
                "A disabled account cannot retain verified metadata"
            );
            anyhow::ensure!(
                association.fingerprint.len() == 64
                    && association
                        .fingerprint
                        .bytes()
                        .all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()),
                "Invalid account metadata fingerprint"
            );
            anyhow::ensure!(
                association
                    .remote_name
                    .as_ref()
                    .is_none_or(|name| !name.is_empty()
                        && name.len() <= 4096
                        && !name.contains(['\0', '\n', '\r'])),
                "Invalid account metadata remote"
            );
            crate::repository_context::validate_metadata(&association.metadata)?;
            if let AccountAssignment::Assigned { host, .. } = &self.assignment {
                anyhow::ensure!(
                    association.metadata.identity.host == *host,
                    "Account metadata belongs to another host"
                );
            }
        }
        Ok(())
    }
}
pub(crate) struct AccountState {
    pub view: RepositoryAccount,
    pub record: Option<crate::registry::SavedRepositoryRecord>,
}
impl Repository {
    pub(crate) async fn account_store_state(&self) -> Result<AccountState> {
        let repository = self.clone();
        let record = cancellation::blocking(move || repository.saved_record()).await?;
        let stored = record
            .as_ref()
            .map(|record| record.account.clone())
            .unwrap_or_default();
        stored.validate()?;
        let scope_id = record.as_ref().map(|record| record.id.clone());
        let namespace = self
            .account_registry()
            .map(|registry| registry.namespace_id());
        let basis = digest(&(&namespace, &scope_id, &stored))?;
        let view = RepositoryAccount {
            basis,
            scope_id,
            saved: record.is_some(),
            revision: stored.revision,
            assignment: stored.assignment.clone(),
            scoped_metadata: stored.scoped(),
        };
        Ok(AccountState { view, record })
    }
    pub(crate) async fn account_state(&self) -> Result<AccountState> {
        let mut state = self.account_store_state().await?;
        let binding = self.selected_binding().await?;
        state.view.basis = digest(&(&state.view.basis, &binding.remote, &binding.fingerprint))?;
        Ok(state)
    }
    pub(crate) async fn repository_account(&self) -> Result<Value> {
        self.account_view(self.account_state().await?).await
    }
    pub(crate) async fn ensure_account_basis(&self, basis: &str) -> Result<()> {
        anyhow::ensure!(
            self.account_state().await?.view.basis == basis,
            "Repository account changed; reload before retrying"
        );
        Ok(())
    }
}

struct AccountPlan {
    view: Value,
    current: AccountState,
    replacement: StoredAccount,
    binding: crate::repository_context::Binding,
}
impl Default for AccountAssignment {
    fn default() -> Self {
        Self::Effective {}
    }
}
fn target_normalized(target: AccountTarget) -> Result<AccountTarget> {
    match target {
        AccountTarget::Assigned { host, login } => {
            crate::github::validate_host(&host)?;
            let parsed = RepositoryIdentity::from_url(&format!("https://{host}/owner/repository"))?;
            validate_identity(&parsed.host, &login)?;
            Ok(AccountTarget::Assigned {
                host: parsed.host,
                login,
            })
        }
        target => Ok(target),
    }
}
fn metadata_from_rest(
    data: &Value,
    identity: &RepositoryIdentity,
) -> Result<(RepositoryMetadata, u64)> {
    let id = data["id"]
        .as_u64()
        .filter(|id| *id > 0)
        .context("GitHub repository is missing its numeric identity")?;
    anyhow::ensure!(
        RepositoryIdentity::from_url(
            data["html_url"]
                .as_str()
                .context("GitHub repository URL is missing")?
        )? == *identity,
        "GitHub account verification returned another repository"
    );
    anyhow::ensure!(
        data["full_name"].as_str().is_some_and(
            |full| full.eq_ignore_ascii_case(&format!("{}/{}", identity.owner, identity.name))
        ) && data["name"]
            .as_str()
            .is_some_and(|name| name.eq_ignore_ascii_case(&identity.name))
            && data["owner"]["login"]
                .as_str()
                .is_some_and(|owner| owner.eq_ignore_ascii_case(&identity.owner))
            && data["private"].is_boolean(),
        "GitHub repository identity or privacy is inconsistent"
    );
    let is_fork = data["fork"]
        .as_bool()
        .context("GitHub repository fork status is missing")?;
    let parent = if data["parent"].is_null() {
        None
    } else {
        let parent = &data["parent"];
        let full = parent["full_name"]
            .as_str()
            .context("GitHub fork parent name is missing")?;
        let parsed = RepositoryIdentity::from_url(&format!("https://{}/{full}", identity.host))?;
        if let Some(url) = parent["html_url"].as_str() {
            anyhow::ensure!(
                RepositoryIdentity::from_url(url)? == parsed,
                "GitHub fork parent URL is inconsistent"
            );
        }
        Some(parsed)
    };
    let metadata = RepositoryMetadata {
        identity: identity.clone(),
        is_fork,
        parent,
        updated_at_secs: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)?
            .as_secs(),
    };
    crate::repository_context::validate_metadata(&metadata)?;
    Ok((metadata, id))
}
impl Repository {
    async fn account_view(&self, state: AccountState) -> Result<Value> {
        let mut view = serde_json::to_value(state.view)?;
        let binding = self.selected_binding().await?;
        view["repository"] = serde_json::to_value(binding.identity)?;
        view["remote"] = serde_json::to_value(binding.remote)?;
        Ok(view)
    }
    pub(crate) async fn repository_account_catalog(&self) -> Result<Value> {
        let state = self.account_state().await?;
        let binding = self.selected_binding().await?;
        let Some(identity) = binding.identity.as_ref() else {
            return Ok(
                json!({"account":self.account_view(state).await?,"host":null,"accounts":[],"status":"unavailable","reason":"Select a recognized GitHub fetch remote before loading accounts"}),
            );
        };
        let response = crate::github_api::account_catalog(&self.path, &identity.host).await?;
        self.ensure_account_basis(&state.view.basis).await?;
        let fresh = self.selected_binding().await?;
        anyhow::ensure!(
            fresh.remote == binding.remote && fresh.fingerprint == binding.fingerprint,
            "Fetch remote changed while loading accounts; reload"
        );
        let (status, accounts, reason) = match response {
            Ok(accounts) => ("available", serde_json::to_value(accounts)?, None),
            Err(_) => (
                "unavailable",
                json!([]),
                Some("GitHub account catalog is unavailable; the current assignment was retained"),
            ),
        };
        Ok(
            json!({"account":self.account_view(state).await?,"host":identity.host,"accounts":accounts,"status":status,"reason":reason}),
        )
    }
    async fn account_plan(&self, target: AccountTarget) -> Result<AccountPlan> {
        let target = target_normalized(target)?;
        let current = self.account_state().await?;
        let record = current
            .record
            .as_ref()
            .context("Save this repository before changing its account")?;
        let binding = self.selected_binding().await?;
        let mut replacement = StoredAccount {
            revision: record
                .account
                .revision
                .checked_add(1)
                .context("Repository account revision overflow")?,
            assignment: AccountAssignment::Effective {},
            association: None,
            source_remote: binding.remote.clone(),
        };
        let mut actor = Value::Null;
        let mut status = "unverified";
        let mut can_apply = true;
        let mut reason = None;
        let mut repository_id = None;
        match &target {
            AccountTarget::None {} => {
                replacement.assignment = AccountAssignment::None {};
                status = "disabled";
            }
            AccountTarget::Effective {} => {
                reason = Some(
                    "Future operations will use the effective GitHub CLI credential; verified account metadata will be cleared",
                );
            }
            AccountTarget::Assigned { host, login } => {
                let identity = binding.identity.as_ref().context(
                    "Select a recognized GitHub fetch remote before assigning an account",
                )?;
                anyhow::ensure!(
                    host == &identity.host,
                    "The chosen account host does not match the fetch remote"
                );
                let verification = async {
                    let catalog = crate::github_api::account_catalog(&self.path, host)
                        .await?
                        .map_err(|_| anyhow::anyhow!("Account catalog is unavailable"))?;
                    let candidates = catalog
                        .iter()
                        .filter(|account| account.login.eq_ignore_ascii_case(login))
                        .collect::<Vec<_>>();
                    anyhow::ensure!(
                        candidates.len() == 1,
                        "The chosen stored GitHub account is unavailable or ambiguous"
                    );
                    let stored_login = &candidates[0].login;
                    let chosen = crate::github_api::ChosenAccount {
                        host,
                        login: stored_login,
                        id: None,
                    };
                    let session = crate::github_api::Session::open_for_account(
                        &self.path,
                        identity,
                        Some(chosen),
                    )
                    .await?
                    .map_err(|_| {
                        anyhow::anyhow!("The chosen GitHub account is signed out or unavailable")
                    })?;
                    let user = session
                        .get(crate::github_api::Request::User)
                        .await?
                        .map_err(|_| anyhow::anyhow!("Cannot verify the chosen GitHub account"))?;
                    let id = user["id"]
                        .as_u64()
                        .filter(|id| *id > 0 && *id <= 9_007_199_254_740_991)
                        .context("Invalid GitHub account ID")?;
                    let server_login = user["login"]
                        .as_str()
                        .context("GitHub account login is missing")?;
                    anyhow::ensure!(
                        server_login.eq_ignore_ascii_case(stored_login),
                        "GitHub actor does not match the chosen account"
                    );
                    let data = session
                        .get(crate::github_api::Request::Repository)
                        .await?
                        .map_err(|_| {
                            anyhow::anyhow!(
                                "The chosen GitHub account cannot access this repository"
                            )
                        })?;
                    let (metadata, repo_id) = metadata_from_rest(&data, identity)?;
                    let after = session
                        .get(crate::github_api::Request::User)
                        .await?
                        .map_err(|_| anyhow::anyhow!("Cannot recheck the chosen GitHub account"))?;
                    anyhow::ensure!(
                        after["id"].as_u64() == Some(id)
                            && after["login"]
                                .as_str()
                                .is_some_and(|login| login.eq_ignore_ascii_case(server_login)),
                        "GitHub account identity changed while verifying access"
                    );
                    Ok::<_, anyhow::Error>((
                        id,
                        stored_login.clone(),
                        server_login.to_owned(),
                        metadata,
                        repo_id,
                    ))
                }
                .await;
                cancellation::Cancellation::current().check()?;
                match verification {
                    Ok((id, stored_login, server_login, metadata, repo_id)) => {
                        replacement.assignment = AccountAssignment::Assigned {
                            host: host.clone(),
                            login: stored_login,
                            id,
                        };
                        actor = json!({"host":host,"login":server_login,"id":id});
                        replacement.association = Some(ScopedAssociation {
                            remote_name: binding.remote.clone(),
                            fingerprint: binding.fingerprint.clone(),
                            metadata,
                        });
                        repository_id = Some(repo_id);
                        status = "verified";
                    }
                    Err(_) => {
                        can_apply = false;
                        status = "unavailable";
                        reason = Some(
                            "The chosen stored account or repository access could not be verified; sign in to that account and reload the review",
                        );
                    }
                }
            }
        }
        self.ensure_account_basis(&current.view.basis).await?;
        let fresh = self.selected_binding().await?;
        anyhow::ensure!(
            fresh.fingerprint == binding.fingerprint && fresh.remote == binding.remote,
            "Fetch remote changed while reviewing the account; reload"
        );
        // Deliberately exclude credentials and wall-clock cache timestamps.
        let stable_metadata=replacement.association.as_ref().map(|association|json!({"identity":association.metadata.identity,"is_fork":association.metadata.is_fork,"parent":association.metadata.parent}));
        let basis = digest(
            &json!({"root":self.id(),"account":current.view.basis,"remote":binding.remote,"fingerprint":binding.fingerprint,"target":target,"assignment":replacement.assignment,"actor":actor,"metadata":stable_metadata,"repository_id":repository_id,"can_apply":can_apply,"status":status}),
        )?;
        let view = json!({"basis":basis,"current":self.account_view(AccountState{view:current.view.clone(),record:current.record.clone()}).await?,"target":target,"actor":actor,"repository":binding.identity,"can_apply":can_apply,"status":status,"reason":reason});
        Ok(AccountPlan {
            view,
            current,
            replacement,
            binding,
        })
    }
    pub(crate) async fn repository_account_preview(&self, target: AccountTarget) -> Result<Value> {
        Ok(self.account_plan(target).await?.view)
    }
    pub(crate) async fn set_repository_account(
        &self,
        target: AccountTarget,
        basis: &str,
    ) -> Result<Value> {
        let plan = self.account_plan(target).await?;
        anyhow::ensure!(
            plan.view["basis"] == basis,
            "Repository account review changed; reload before saving"
        );
        anyhow::ensure!(
            plan.view["can_apply"] == true,
            "The chosen repository account could not be verified"
        );
        let _lock = self.stash_lock().await?;
        self.ensure_account_basis(&plan.current.view.basis).await?;
        let fresh = self.selected_binding().await?;
        anyhow::ensure!(
            fresh.fingerprint == plan.binding.fingerprint && fresh.remote == plan.binding.remote,
            "Fetch remote changed; reload the account review"
        );
        let record = plan
            .current
            .record
            .context("Saved repository is unavailable")?;
        let registry = self
            .account_registry()
            .context("Repository registry is unavailable")?
            .clone();
        let assigned = matches!(
            plan.replacement.assignment,
            AccountAssignment::Assigned { .. }
        );
        cancellation::blocking(move || {
            registry.compare_and_replace_account(
                &record.id,
                record.account.revision,
                plan.replacement,
            )
        })
        .await?;
        // Association follows the same add-only parent setup as metadata refresh.
        let setup = if assigned {
            Some(self.ensure_upstream_locked(None).await)
        } else {
            None
        };
        let mut view = self.repository_account().await?;
        if let Some(Err(error)) = setup {
            view["upstream_setup_error"] = Value::String(error.to_string());
        }
        Ok(view)
    }
}

impl Repository {
    pub(crate) async fn execute_github_bound(
        &self,
        mut request: crate::GitHubRequest,
    ) -> Result<Value> {
        if request.is_auth_status() {
            return crate::execute_github(&self.path, request).await;
        }
        let creating_pull_request = matches!(
            &request.action,
            crate::GitHubAction::CreatePullRequest { .. }
        );
        let account = self.account_state().await?;
        if let Some(expected) = &request.account_basis {
            anyhow::ensure!(
                expected == &account.view.basis,
                "Repository account changed since this GitHub request was prepared; reload before retrying"
            );
        }
        // The witness is consumed here; command construction must never use it
        // as a provider argument or silently ignore it outside this scope.
        request.account_basis = None;
        let output = match &account.view.assignment {
            AccountAssignment::Effective {} => {
                // Native credential precedence remains effective, while an
                // available working-tree identity fixes the repository target.
                if request.repository.is_none()
                    && let Some(identity) = self.selected_binding().await?.identity
                {
                    request.repository = Some(identity.selector());
                }
                self.ensure_account_basis(&account.view.basis).await?;
                crate::execute_github(&self.path, request).await?
            }
            AccountAssignment::None {} => anyhow::bail!(
                "No GitHub account is assigned to this repository; choose an account before this operation"
            ),
            AccountAssignment::Assigned { host, login, id } => {
                let binding = self.selected_binding().await?;
                let source = binding.identity.context(
                    "Select a recognized GitHub fetch remote before using the assigned account",
                )?;
                anyhow::ensure!(
                    &source.host == host,
                    "Fetch remote host changed; review the repository account assignment"
                );
                let selected = if let Some(selector) = &request.repository {
                    crate::github::validate_repository(selector)?;
                    let parts = selector.split('/').collect::<Vec<_>>();
                    match parts.as_slice() {
                        [owner, name] => {
                            RepositoryIdentity::from_url(&format!("https://{host}/{owner}/{name}"))?
                        }
                        [target_host, owner, name] => RepositoryIdentity::from_url(&format!(
                            "https://{target_host}/{owner}/{name}"
                        ))?,
                        _ => anyhow::bail!("Invalid GitHub repository selector"),
                    }
                } else {
                    source
                };
                anyhow::ensure!(
                    &selected.host == host,
                    "The requested GitHub host differs from the assigned account host"
                );
                request.repository = Some(selected.selector());
                let session=crate::github_api::Session::open_for_account(&self.path,&selected,Some(crate::github_api::ChosenAccount{host,login,id:Some(*id)})).await?.map_err(|_|anyhow::anyhow!("The assigned GitHub account is signed out or unavailable; its assignment was retained"))?;
                self.ensure_account_basis(&account.view.basis).await?;
                let fresh = self.selected_binding().await?;
                anyhow::ensure!(
                    fresh.remote == binding.remote && fresh.fingerprint == binding.fingerprint,
                    "Fetch remote changed while opening the assigned account; review before retrying"
                );
                let session = std::sync::Arc::new(session);
                let output = match &request.action {
                    crate::GitHubAction::CheckoutPullRequest { number } => {
                        crate::git_credentials::seed_session(session.clone()).await?;
                        Box::pin(self.checkout_pull_request_assigned(
                            *number,
                            &session,
                            &selected,
                            &account.view.basis,
                        ))
                        .await?
                    }
                    crate::GitHubAction::CreatePullRequest {
                        title,
                        body,
                        base,
                        head,
                        draft,
                    } => {
                        Box::pin(self.create_pull_request_assigned(
                            &session,
                            &selected,
                            &account.view.basis,
                            crate::github_create::Draft {
                                title,
                                body,
                                base,
                                head,
                                draft: *draft,
                            },
                        ))
                        .await?
                    }
                    _ => {
                        crate::github::execute_github_session(&self.path, request, &session).await?
                    }
                };
                let checked_binding = self.selected_binding().await;
                let fresh = if creating_pull_request {
                    checked_binding.context("Cannot recheck repository scope after pull request creation; inspect GitHub before retrying")?
                } else {
                    checked_binding?
                };
                anyhow::ensure!(
                    fresh.remote == binding.remote && fresh.fingerprint == binding.fingerprint,
                    "Fetch remote changed during the GitHub operation; inspect GitHub before retrying a mutation"
                );
                output
            }
        };
        let checked_account = self.ensure_account_basis(&account.view.basis).await;
        if creating_pull_request {
            checked_account.context("Repository scope changed after pull request creation; inspect GitHub before retrying")?;
        } else {
            checked_account?;
        }
        Ok(output)
    }
    pub(crate) async fn open_rule_session(
        &self,
        identity: &RepositoryIdentity,
    ) -> Result<std::result::Result<crate::github_api::Session, crate::github_api::Failure>> {
        let account = self.account_state().await?;
        match &account.view.assignment {
            AccountAssignment::None {} => {
                Ok(Err(crate::github_api::Failure::NoAccount { code: 4 }))
            }
            AccountAssignment::Effective {} => {
                crate::github_api::Session::open(&self.path, identity).await
            }
            AccountAssignment::Assigned { host, login, id } => {
                anyhow::ensure!(
                    host == &identity.host,
                    "The assigned account host differs from the repository host"
                );
                crate::github_api::Session::open_for_account(
                    &self.path,
                    identity,
                    Some(crate::github_api::ChosenAccount {
                        host,
                        login,
                        id: Some(*id),
                    }),
                )
                .await
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn account_targets_cannot_supply_trusted_actor_or_verification() {
        for value in [
            json!({"mode":"assigned","host":"github.com","login":"User","id":7}),
            json!({"mode":"assigned","host":"github.com","login":"User","verified":true}),
            json!({"mode":"none","allow":true}),
        ] {
            assert!(
                serde_json::from_value::<AccountTarget>(value.clone()).is_err(),
                "{value}"
            );
        }
        for assignment in [
            AccountAssignment::Assigned {
                host: "github.com".into(),
                login: "User".into(),
                id: 0,
            },
            AccountAssignment::Assigned {
                host: "evil.github.com".into(),
                login: "--help".into(),
                id: 7,
            },
        ] {
            assert!(
                StoredAccount {
                    assignment,
                    ..Default::default()
                }
                .validate()
                .is_err()
            );
        }
    }
    #[test]
    fn verified_account_metadata_binds_rest_identity_and_fork_parent() {
        let identity = RepositoryIdentity::from_url("https://github.com/Owner/Repository").unwrap();
        let value = json!({"id":70,"full_name":"Owner/Repository","name":"Repository","owner":{"login":"Owner"},"html_url":"https://github.com/Owner/Repository","private":true,"fork":true,"parent":{"full_name":"Parent/Repository","html_url":"https://github.com/Parent/Repository"}});
        let (metadata, id) = metadata_from_rest(&value, &identity).unwrap();
        assert_eq!(id, 70);
        assert!(metadata.is_fork);
        assert_eq!(metadata.parent.unwrap().owner, "parent");
        for (field, replacement) in [
            ("html_url", json!("https://github.com/Other/Repository")),
            ("full_name", json!("Other/Repository")),
            ("private", Value::Null),
            ("fork", json!(false)),
            ("id", json!(0)),
        ] {
            let mut invalid = value.clone();
            invalid[field] = replacement;
            assert!(metadata_from_rest(&invalid, &identity).is_err(), "{field}");
        }
    }
    #[test]
    fn disabling_accounts_cannot_keep_verified_metadata_or_invalid_source_names() {
        let identity = RepositoryIdentity::from_url("https://github.com/Owner/Repository").unwrap();
        let association = ScopedAssociation {
            remote_name: Some("z-fork".into()),
            fingerprint: "a".repeat(64),
            metadata: RepositoryMetadata {
                identity,
                is_fork: false,
                parent: None,
                updated_at_secs: 0,
            },
        };
        let disabled = StoredAccount {
            revision: 1,
            assignment: AccountAssignment::None {},
            association: Some(association),
            source_remote: Some("z-fork".into()),
        };
        assert!(disabled.validate().is_err());
        let disabled = StoredAccount {
            association: None,
            ..disabled
        };
        assert!(disabled.validate().is_ok());
        for source in ["", "line\nbreak", "nul\0byte"] {
            assert!(
                StoredAccount {
                    source_remote: Some(source.into()),
                    ..disabled.clone()
                }
                .validate()
                .is_err()
            );
        }
    }
}
