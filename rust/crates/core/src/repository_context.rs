//! Offline repository workflow preferences and verified GitHub fork association.
mod identity;
mod upstream;
use crate::{Repository, args, cancellation, process};
use anyhow::{Context, Result};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
pub use identity::Identity as RepositoryIdentity;
use identity::Identity;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

const RECORD: &str = "desktop-repository.json";
const ID: &str = "desktop-repository.id";
const LOCK: &str = "desktop-repository.lock";
const LIMIT: usize = 64 * 1024;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ForkContributionTarget {
    #[default]
    Parent,
    #[serde(rename = "self")]
    Self_,
}
// The wire spelling follows Desktop's preference, not the Rust variant name.

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RepositoryMetadata {
    pub identity: Identity,
    pub is_fork: bool,
    pub parent: Option<Identity>,
    pub updated_at_secs: u64,
}
type Association = crate::accounts::ScopedAssociation;
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Stored {
    version: u32,
    repository_id: String,
    revision: u64,
    fork_contribution_target: ForkContributionTarget,
    association: Option<Association>,
}
#[derive(Clone, Debug, Serialize)]
pub struct RepositoryContext {
    pub basis: String,
    pub fork_contribution_target: ForkContributionTarget,
    pub status: &'static str,
    pub remote: Option<String>,
    pub repository: Option<RepositoryMetadata>,
    pub contribution_remote: Option<String>,
    pub upstream_status: Option<&'static str>,
}
pub(crate) struct BranchContext {
    pub view: RepositoryContext,
    pub remote: Option<String>,
    pub inspect_head: bool,
}
#[derive(Clone)]
pub(crate) struct Binding {
    pub(crate) remote: Option<String>,
    pub(crate) fingerprint: String,
    pub(crate) identity: Option<Identity>,
}
struct Locked {
    directory: Dir,
    _lock: File,
    state: Stored,
}
fn hash(value: &impl Serialize) -> Result<String> {
    Ok(format!("{:x}", Sha256::digest(serde_json::to_vec(value)?)))
}
fn owner(path: &Path) -> String {
    format!("{:x}", Sha256::digest(path.as_os_str().as_encoded_bytes()))
}
fn options(write: bool) -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(write).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.mode(0o600).custom_flags(libc::O_NONBLOCK);
    }
    options
}
fn validate_file(file: &File) -> Result<()> {
    let metadata = file.metadata()?;
    anyhow::ensure!(
        metadata.is_file(),
        "Repository context and lock must be regular files"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        anyhow::ensure!(
            metadata.uid() == unsafe { libc::geteuid() }
                && metadata.nlink() == 1
                && metadata.mode() & 0o077 == 0,
            "Repository context and lock must be private files owned by this user"
        );
    }
    Ok(())
}
pub(crate) fn validate_metadata(value: &RepositoryMetadata) -> Result<()> {
    value.identity.validate()?;
    anyhow::ensure!(
        value.is_fork == value.parent.is_some(),
        "Incomplete GitHub fork metadata"
    );
    if let Some(parent) = &value.parent {
        parent.validate()?;
        anyhow::ensure!(
            parent.host == value.identity.host && parent != &value.identity,
            "Invalid GitHub fork parent"
        );
    }
    Ok(())
}
fn read_id(directory: &Dir) -> Result<Option<String>> {
    let mut file = match directory.open_with(ID, &options(false)) {
        Ok(file) => file.into_std(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(error).context("Read repository identity; existing data was not changed");
        }
    };
    validate_file(&file)?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file).take(129).read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= 128,
        "Repository identity exceeds supported size"
    );
    let text = std::str::from_utf8(&bytes)?;
    let text = text.strip_suffix('\n').unwrap_or(text);
    anyhow::ensure!(
        uuid::Uuid::parse_str(text)?.to_string() == text,
        "Invalid repository identity"
    );
    Ok(Some(text.into()))
}
fn read(directory: &Dir, repository_id: &str) -> Result<Stored> {
    let mut file = match directory.open_with(RECORD, &options(false)) {
        Ok(file) => file.into_std(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Stored {
                version: 1,
                repository_id: read_id(directory)?.unwrap_or_else(|| repository_id.into()),
                revision: 0,
                fork_contribution_target: ForkContributionTarget::Parent,
                association: None,
            });
        }
        Err(error) => {
            return Err(error).context("Read repository context; existing data was not changed");
        }
    };
    validate_file(&file)?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take((LIMIT + 1) as u64)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= LIMIT,
        "Repository context exceeds supported size"
    );
    let state: Stored = serde_json::from_slice(&bytes)
        .context("Invalid repository context; existing data was not changed")?;
    // JSON is published after the immutable marker. Read the marker last so
    // a concurrent first publication cannot make a healthy UUID record foreign.
    let stable_id = read_id(directory)?;
    anyhow::ensure!(
        state.version == 1
            && (stable_id.as_deref() == Some(state.repository_id.as_str())
                || state.repository_id == repository_id),
        "Unsupported or foreign repository context"
    );
    if let Some(association) = &state.association {
        anyhow::ensure!(
            association.fingerprint.len() == 64
                && association
                    .fingerprint
                    .bytes()
                    .all(|byte| byte.is_ascii_hexdigit()),
            "Invalid repository association fingerprint"
        );
        validate_metadata(&association.metadata)?;
        if let Some(name) = &association.remote_name {
            anyhow::ensure!(
                !name.is_empty() && name.len() <= 4096 && !name.contains(['\0', '\n', '\r']),
                "Invalid cached fetch remote name"
            );
        }
    }
    Ok(state)
}
fn publish(directory: &Dir, name: &str, bytes: &[u8]) -> Result<()> {
    anyhow::ensure!(
        bytes.len() < LIMIT,
        "Repository context exceeds supported size"
    );
    let temporary = format!(".desktop-repository-{}.tmp", uuid::Uuid::new_v4());
    let mut create = options(true);
    create.create_new(true);
    let result = (|| -> Result<()> {
        let mut file = directory.open_with(&temporary, &create)?.into_std();
        validate_file(&file)?;
        file.write_all(bytes)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        directory.rename(&temporary, directory, name)?;
        #[cfg(unix)]
        directory.open(".")?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = directory.remove_file(&temporary);
    }
    result
}
fn store(locked: Locked, mut state: Stored) -> Result<()> {
    cancellation::Cancellation::current().check()?;
    // The stable identity travels with .git. Missing-file reads use an
    // ephemeral path ID until the first explicit mutation publishes this UUID.
    // A legacy path-bound record remains readable during its two-file upgrade.
    state.repository_id = if let Some(id) = read_id(&locked.directory)? {
        id
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        publish(&locked.directory, ID, id.as_bytes())?;
        id
    };
    publish(
        &locked.directory,
        RECORD,
        &serde_json::to_vec_pretty(&state)?,
    )
}
impl Repository {
    pub(crate) async fn fetch_remote_names(&self) -> Result<Vec<String>> {
        let configured = self
            .run(&args(&[
                "config",
                "--null",
                "--get-regexp",
                r"^remote\..+\.url$",
            ]))
            .await?;
        anyhow::ensure!(
            matches!(configured.code, 0 | 1),
            "Cannot inspect fetch remotes"
        );
        let mut names = std::collections::BTreeSet::new();
        for entry in configured
            .stdout
            .split(|byte| *byte == 0)
            .filter(|entry| !entry.is_empty())
        {
            let at = entry
                .iter()
                .position(|byte| *byte == b'\n')
                .context("Remote URL configuration is missing a value")?;
            let key = std::str::from_utf8(&entry[..at])?;
            let name = key
                .strip_prefix("remote.")
                .and_then(|key| key.strip_suffix(".url"))
                .context("Invalid remote URL configuration key")?;
            if entry[at + 1..].is_empty() {
                names.remove(name);
            } else {
                names.insert(name.to_owned());
            }
        }
        let mut names = names.into_iter().collect::<Vec<_>>();
        names.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
        Ok(names)
    }
    pub(crate) async fn fetch_binding(&self, remote: Option<String>) -> Result<Binding> {
        let Some(name) = remote.as_deref() else {
            return Ok(Binding {
                remote: None,
                fingerprint: hash(&None::<String>)?,
                identity: None,
            });
        };
        let output = process::run_checkout(
            &self.path,
            &args(&[
                "-c",
                "transfer.credentialsInUrl=allow",
                "ls-remote",
                "--get-url",
                "--",
                name,
            ]),
        )
        .await?;
        anyhow::ensure!(
            output.code == 0,
            "Cannot inspect effective fetch remote URL"
        );
        let bytes = output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout);
        let fingerprint = hash(&(name, bytes))?;
        let identity = std::str::from_utf8(bytes)
            .ok()
            .and_then(|url| Identity::from_url(url).ok());
        Ok(Binding {
            remote,
            fingerprint,
            identity,
        })
    }
    async fn context_association(
        &self,
        state: &Stored,
    ) -> Result<(Option<Association>, Option<String>)> {
        let account = self.account_store_state().await?;
        if account.view.scoped_metadata {
            Ok((
                account.record.and_then(|record| record.account.association),
                Some(account.view.basis),
            ))
        } else {
            Ok((state.association.clone(), None))
        }
    }
    async fn binding_for_state(&self, state: &Stored) -> Result<Binding> {
        let names = self.fetch_remote_names().await?;
        if let Some(origin) = names.iter().find(|name| *name == "origin") {
            return self.fetch_binding(Some(origin.clone())).await;
        }
        let account = self.account_store_state().await?;
        if let Some(name) = account
            .record
            .as_ref()
            .and_then(|record| record.account.source_remote.as_ref())
            .filter(|name| names.contains(name))
        {
            return self.fetch_binding(Some(name.clone())).await;
        }
        let (association, _) = self.context_association(state).await?;
        if let Some(cached) = association.as_ref() {
            if let Some(name) = cached
                .remote_name
                .as_ref()
                .filter(|name| names.contains(name))
            {
                return self.fetch_binding(Some(name.clone())).await;
            }
            if cached.remote_name.is_none() {
                // Earlier cache records omitted the remote name. Recover their
                // exact binding before an auxiliary upstream changes name order.
                for name in &names {
                    let binding = self.fetch_binding(Some(name.clone())).await?;
                    if binding.fingerprint == cached.fingerprint
                        && binding.identity.as_ref() == Some(&cached.metadata.identity)
                    {
                        return Ok(binding);
                    }
                }
            }
        }
        self.fetch_binding(names.first().cloned()).await
    }
    pub(crate) async fn selected_binding(&self) -> Result<Binding> {
        self.binding_for_state(&self.context_state().await?).await
    }
    async fn context_state(&self) -> Result<Stored> {
        let common = self.common_directory().await?;
        cancellation::blocking(move || {
            let directory = Dir::open_ambient_dir(&common, ambient_authority())?;
            read(&directory, &owner(&common))
        })
        .await
    }
    async fn lock_context(&self) -> Result<Locked> {
        let common = self.common_directory().await?;
        cancellation::blocking(move || {
            let directory = Dir::open_ambient_dir(&common, ambient_authority())?;
            let mut create = options(true);
            create.create(true);
            let lock = directory.open_with(LOCK, &create)?.into_std();
            validate_file(&lock)?;
            loop {
                cancellation::Cancellation::current().check()?;
                match lock.try_lock() {
                    Ok(()) => break,
                    Err(std::fs::TryLockError::WouldBlock) => {
                        std::thread::sleep(std::time::Duration::from_millis(10))
                    }
                    Err(std::fs::TryLockError::Error(error)) => {
                        return Err(error).context("Lock repository context");
                    }
                }
            }
            let state = read(&directory, &owner(&common))?;
            Ok(Locked {
                directory,
                _lock: lock,
                state,
            })
        })
        .await
    }
    async fn context_view(&self, state: &Stored, binding: &Binding) -> Result<BranchContext> {
        let (cached_association, account_basis) = self.context_association(state).await?;
        let association = cached_association.as_ref().filter(|cached| {
            cached.fingerprint == binding.fingerprint
                && binding.identity.as_ref() == Some(&cached.metadata.identity)
        });
        let status = if association.is_some() {
            "verified"
        } else if cached_association.is_some() {
            "stale"
        } else if binding.remote.is_some() && binding.identity.is_none() {
            "unrecognized_remote"
        } else {
            "unverified"
        };
        let repository = association.map(|cached| cached.metadata.clone());
        let parent = repository.as_ref().and_then(|repo| repo.parent.as_ref());
        let use_parent =
            parent.is_some() && state.fork_contribution_target == ForkContributionTarget::Parent;
        let mut inspect_head = true;
        let mut upstream_status = None;
        let mut upstream_fingerprint = None;
        if let Some(parent) = parent {
            if self
                .fetch_remote_names()
                .await?
                .iter()
                .any(|remote| remote == "upstream")
            {
                let upstream = self.fetch_binding(Some("upstream".into())).await?;
                upstream_status = Some(match upstream.identity.as_ref() {
                    Some(identity) if identity == parent => "matches_parent",
                    Some(_) => "mismatch",
                    None => "unrecognized",
                });
                upstream_fingerprint = Some(upstream.fingerprint);
            } else {
                upstream_status = Some("missing");
            }
            if use_parent {
                inspect_head = upstream_status == Some("matches_parent");
            }
        }
        let remote = if use_parent {
            Some("upstream".into())
        } else {
            binding.remote.clone()
        };
        let basis = hash(&(
            state,
            &binding.fingerprint,
            &binding.remote,
            &upstream_fingerprint,
            &account_basis,
        ))?;
        let view = RepositoryContext {
            basis,
            fork_contribution_target: state.fork_contribution_target,
            status,
            remote: binding.remote.clone(),
            repository,
            contribution_remote: remote.clone(),
            upstream_status,
        };
        Ok(BranchContext {
            view,
            remote,
            inspect_head,
        })
    }
    pub(crate) async fn branch_context(&self) -> Result<BranchContext> {
        let state = self.context_state().await?;
        let binding = self.binding_for_state(&state).await?;
        self.context_view(&state, &binding).await
    }
    pub(crate) async fn repository_context(&self) -> Result<Value> {
        Ok(serde_json::to_value(self.branch_context().await?.view)?)
    }
    pub(crate) async fn set_fork_contribution_target(
        &self,
        target: ForkContributionTarget,
        basis: Option<&str>,
    ) -> Result<Value> {
        let _stash_lock = self.stash_lock().await?;
        let locked = self.lock_context().await?;
        let binding = self.binding_for_state(&locked.state).await?;
        let current = self.context_view(&locked.state, &binding).await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                current.view.basis == basis,
                "Contribution settings changed; load them again"
            );
        }
        let mut state = locked.state.clone();
        state.fork_contribution_target = target;
        state.revision = state
            .revision
            .checked_add(1)
            .context("Repository context revision overflow")?;
        cancellation::blocking(move || store(locked, state)).await?;
        self.repository_context().await
    }
    pub(crate) async fn refresh_repository_context(&self) -> Result<Value> {
        let initial_account = self.account_state().await?;
        let initial = self.selected_binding().await?;
        let identity = initial
            .identity
            .as_ref()
            .context("Select a recognized GitHub fetch remote before refreshing metadata")?;
        let output = self
            .execute_github_bound(crate::GitHubRequest {
                repository: Some(identity.selector()),
                account_basis: Some(initial_account.view.basis.clone()),
                action: crate::GitHubAction::Repository,
            })
            .await?;
        let code = output["code"]
            .as_i64()
            .context("Invalid GitHub CLI result")?;
        anyhow::ensure!(
            code == 0,
            "GitHub metadata refresh failed (gh exit {code}); check authentication, host and repository access, then retry"
        );
        let data = &output["data"];
        let returned = Identity::from_url(
            data["url"]
                .as_str()
                .context("GitHub metadata is missing its repository URL")?,
        )?;
        anyhow::ensure!(
            &returned == identity,
            "GitHub metadata belongs to another repository"
        );
        let name = data["nameWithOwner"]
            .as_str()
            .context("GitHub metadata is missing its repository name")?;
        anyhow::ensure!(
            name.eq_ignore_ascii_case(&format!("{}/{}", identity.owner, identity.name)),
            "GitHub metadata repository name does not match the fetch remote"
        );
        let is_fork = data["isFork"]
            .as_bool()
            .context("GitHub metadata is missing fork status")?;
        let parent = if data["parent"].is_null() {
            None
        } else {
            // gh serializes parent repositories with owner.login/name;
            // retain support for explicit nameWithOwner API fixtures too.
            let parent_data = &data["parent"];
            let combined = parent_data["nameWithOwner"]
                .as_str()
                .map(|name| Identity::from_url(&format!("https://{}/{name}", identity.host)))
                .transpose()?;
            let components = parent_data["owner"]["login"]
                .as_str()
                .zip(parent_data["name"].as_str())
                .map(|(owner, name)| {
                    Identity::from_url(&format!("https://{}/{owner}/{name}", identity.host))
                })
                .transpose()?;
            if let (Some(a), Some(b)) = (&combined, &components) {
                anyhow::ensure!(a == b, "GitHub fork parent name is inconsistent");
            }
            let parent = combined
                .or(components)
                .context("GitHub fork parent is missing its repository name")?;
            if let Some(url) = data["parent"]["url"].as_str() {
                anyhow::ensure!(
                    Identity::from_url(url)? == parent,
                    "GitHub fork parent identity is inconsistent"
                );
            }
            Some(parent)
        };
        let metadata = RepositoryMetadata {
            identity: identity.clone(),
            is_fork,
            parent,
            updated_at_secs: SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs(),
        };
        validate_metadata(&metadata)?;
        // Network reads hold no metadata lock. Preserve a concurrent preference
        // edit, but never attach the response to a changed fetch destination.
        let _stash_lock = self.stash_lock().await?;
        let locked = self.lock_context().await?;
        let fresh = self.binding_for_state(&locked.state).await?;
        anyhow::ensure!(
            fresh.remote == initial.remote && fresh.fingerprint == initial.fingerprint,
            "Fetch remote changed during metadata refresh; cached data was not replaced"
        );
        self.ensure_account_basis(&initial_account.view.basis)
            .await?;
        let association = Association {
            remote_name: fresh.remote.clone(),
            fingerprint: fresh.fingerprint,
            metadata,
        };
        if initial_account.view.scoped_metadata {
            let record = initial_account
                .record
                .context("Saved repository account is unavailable")?;
            let registry = self
                .account_registry()
                .context("Repository registry is unavailable")?
                .clone();
            let mut replacement = record.account.clone();
            replacement.revision = replacement
                .revision
                .checked_add(1)
                .context("Repository account revision overflow")?;
            replacement.source_remote = association.remote_name.clone();
            replacement.association = Some(association);
            drop(locked);
            cancellation::blocking(move || {
                registry.compare_and_replace_account(
                    &record.id,
                    record.account.revision,
                    replacement,
                )
            })
            .await?;
        } else {
            let mut state = locked.state.clone();
            state.association = Some(association);
            state.revision = state
                .revision
                .checked_add(1)
                .context("Repository context revision overflow")?;
            cancellation::blocking(move || store(locked, state)).await?;
        }
        // Match Desktop's automatic parent-remote setup after association.
        // Keep a successfully verified cache if an occupied upstream blocks it.
        let setup = self.ensure_upstream_locked(None).await;
        let mut context = self.repository_context().await?;
        if let Err(error) = setup {
            context["upstream_setup_error"] = Value::String(error.to_string());
        }
        Ok(context)
    }
}
