//! Persistent repository selection, independent of Electron and browser storage.
use crate::{Repository, accounts::StoredAccount, args, process};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Clone)]
pub struct Registry {
    path: PathBuf,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SavedRepositories {
    pub version: u32,
    #[serde(with = "crate::paths::optional")]
    pub selected: Option<PathBuf>,
    #[serde(with = "crate::paths::list")]
    pub repositories: Vec<PathBuf>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub records: Vec<SavedRepositoryRecord>,
    /// Authoritative publication intents survive removal of a saved record.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub(crate) publication_intents: Vec<PublicationIntent>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PublicationIntent {
    pub id: String,
    pub repository_id: String,
    /// Canonical common Git directory links related worktrees.
    #[serde(default)]
    pub common_id: String,
    pub record_id: String,
    pub phase: String,
    /// Digest only: user input or credentials never appear in registry output.
    pub destination_hash: String,
    pub remote_id: Option<u64>,
    pub acknowledged: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identity: Option<PublicationIdentity>,
}

/// Private, previously reviewed source and destination; never serialized in public views.
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct PublicationIdentity {
    pub host: String,
    pub owner: String,
    pub name: String,
    pub actor_login: String,
    pub actor_id: u64,
    pub owner_id: u64,
    pub target: crate::AccountTarget,
    pub account_basis: String,
    pub source_fingerprint: String,
}
impl PublicationIdentity {
    pub(crate) fn validate(&self) -> Result<()> {
        crate::github::validate_repository(&format!("{}/{}/{}", self.host, self.owner, self.name))
            .map_err(|_| anyhow::anyhow!("Invalid publication identity"))?;
        anyhow::ensure!(
            self.host == self.host.to_ascii_lowercase()
                && self.host.len() <= 253
                && self.owner.len() <= 256
                && self.name.len() <= 100
                && !self.actor_login.is_empty()
                && self.actor_login.len() <= 256
                && !self.actor_login.starts_with('-')
                && !matches!(self.actor_login.as_str(), "." | "..")
                && self
                    .actor_login
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.[]".contains(&b))
                && [&self.account_basis, &self.source_fingerprint]
                    .iter()
                    .all(|hash| hash.len() == 64
                        && hash
                            .bytes()
                            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))
                && (1..=9_007_199_254_740_991).contains(&self.actor_id)
                && (1..=9_007_199_254_740_991).contains(&self.owner_id)
                && (!self.owner.eq_ignore_ascii_case(&self.actor_login)
                    || self.owner_id == self.actor_id),
            "Invalid publication identity"
        );
        match &self.target {
            crate::AccountTarget::Effective {} => {}
            crate::AccountTarget::Assigned { host, login } => anyhow::ensure!(
                host.eq_ignore_ascii_case(&self.host)
                    && login.eq_ignore_ascii_case(&self.actor_login),
                "Invalid publication account"
            ),
            crate::AccountTarget::None {} => anyhow::bail!("Invalid publication account"),
        }
        Ok(())
    }
    pub(crate) fn destination_hash(&self) -> Result<String> {
        use sha2::{Digest, Sha256};
        Ok(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                self.host.to_ascii_lowercase(),
                self.owner.to_ascii_lowercase(),
                self.name.to_ascii_lowercase()
            ))?)
        ))
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SavedRepositoryRecord {
    pub id: String,
    #[serde(with = "record_path")]
    pub path: PathBuf,
    pub account: StoredAccount,
}

mod record_path {
    use super::*;
    pub fn serialize<S: serde::Serializer>(path: &Path, serializer: S) -> Result<S::Ok, S::Error> {
        match path.to_str() {
            Some(path) => serializer.serialize_str(path),
            None => crate::GitPath::Bytes {
                bytes: path.as_os_str().as_encoded_bytes().to_vec(),
            }
            .serialize(serializer),
        }
    }
    pub fn deserialize<'de, D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> Result<PathBuf, D::Error> {
        crate::directory_path(crate::GitPath::deserialize(deserializer)?)
            .map_err(serde::de::Error::custom)
    }
}

fn legacy_id(path: &Path) -> String {
    use sha2::{Digest, Sha256};
    format!(
        "legacy-{:x}",
        Sha256::digest(path.as_os_str().as_encoded_bytes())
    )
}

impl SavedRepositories {
    /// Public repository listings exclude private, authoritative recovery state.
    pub fn public_view(&self) -> Result<serde_json::Value> {
        let mut view = serde_json::to_value(self)?;
        view.as_object_mut()
            .context("Invalid saved repository view")?
            .remove("publication_intents");
        Ok(view)
    }

    fn validate(&self) -> Result<()> {
        use std::collections::HashSet;
        let mut paths = HashSet::new();
        for path in &self.repositories {
            anyhow::ensure!(
                path.is_absolute() && paths.insert(path),
                "Invalid saved repository paths"
            );
        }
        anyhow::ensure!(
            self.selected
                .as_ref()
                .is_none_or(|path| paths.contains(path)),
            "Selected repository is not saved"
        );
        let mut ids = HashSet::new();
        let mut records = HashSet::new();
        for record in &self.records {
            let valid_id = record.id.strip_prefix("legacy-").is_some_and(|hash| {
                hash.len() == 64
                    && hash
                        .bytes()
                        .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
            }) || uuid::Uuid::parse_str(&record.id)
                .is_ok_and(|id| id.to_string() == record.id);
            anyhow::ensure!(
                valid_id
                    && ids.insert(record.id.clone())
                    && records.insert(&record.path)
                    && paths.contains(&record.path),
                "Invalid saved repository records"
            );
            record.account.validate()?;
        }
        for path in &self.repositories {
            if !records.contains(path) {
                anyhow::ensure!(
                    ids.insert(legacy_id(path)),
                    "Invalid saved repository record identity"
                );
            }
        }
        anyhow::ensure!(
            self.publication_intents.len() <= 1000,
            "Invalid publication ledger"
        );
        let mut intent_ids = HashSet::new();
        let mut intent_repositories = HashSet::new();
        for intent in &self.publication_intents {
            let valid_hash = intent.repository_id.len() == 64
                && intent
                    .repository_id
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b));
            let valid_receipt =
                uuid::Uuid::parse_str(&intent.id).is_ok_and(|id| id.to_string() == intent.id);
            anyhow::ensure!(
                valid_hash
                    && valid_receipt
                    && (intent.common_id.is_empty()
                        || (intent.common_id.len() == 64
                            && intent
                                .common_id
                                .bytes()
                                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))))
                    && intent_ids.insert(&intent.id)
                    && intent_repositories.insert(&intent.repository_id)
                    && matches!(
                        intent.phase.as_str(),
                        "creation_unknown"
                            | "created"
                            | "origin_unknown"
                            | "origin_added"
                            | "assignment_unknown"
                            | "account_assigned"
                    )
                    && ((intent.phase != "creation_unknown") == intent.remote_id.is_some())
                    && (matches!(intent.phase.as_str(), "creation_unknown" | "created")
                        || intent.identity.is_some())
                    && intent
                        .remote_id
                        .is_none_or(|id| id > 0 && id <= 9_007_199_254_740_991)
                    && intent.destination_hash.len() == 64
                    && intent
                        .destination_hash
                        .bytes()
                        .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
                    && (uuid::Uuid::parse_str(&intent.record_id)
                        .is_ok_and(|id| id.to_string() == intent.record_id)
                        || intent
                            .record_id
                            .strip_prefix("legacy-")
                            .is_some_and(|value| value.len() == 64
                                && value
                                    .bytes()
                                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)))),
                "Invalid publication ledger"
            );
            if let Some(identity) = &intent.identity {
                identity.validate()?;
                anyhow::ensure!(
                    identity.destination_hash()? == intent.destination_hash,
                    "Invalid publication ledger"
                );
            }
        }
        Ok(())
    }
    fn record_for_path(&self, path: &Path) -> Option<SavedRepositoryRecord> {
        if !self.repositories.iter().any(|saved| saved == path) {
            return None;
        }
        Some(
            self.records
                .iter()
                .find(|record| record.path == path)
                .cloned()
                .unwrap_or_else(|| SavedRepositoryRecord {
                    id: legacy_id(path),
                    path: path.to_owned(),
                    account: StoredAccount::default(),
                }),
        )
    }
    pub(crate) fn record_by_id(&self, id: &str) -> Option<SavedRepositoryRecord> {
        self.records
            .iter()
            .find(|record| record.id == id)
            .cloned()
            .or_else(|| {
                self.repositories
                    .iter()
                    .filter(|path| !self.records.iter().any(|record| &record.path == *path))
                    .find(|path| legacy_id(path) == id)
                    .and_then(|path| self.record_for_path(path))
            })
    }
    pub(crate) fn persist_record(&mut self, record: SavedRepositoryRecord) {
        if let Some(saved) = self.records.iter_mut().find(|saved| saved.id == record.id) {
            *saved = record;
        } else {
            self.records.push(record);
        }
    }
}

impl Registry {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path: std::path::absolute(&path).unwrap_or(path),
        }
    }

    /// Credential-free identity for this registry's configuration namespace.
    pub fn namespace_id(&self) -> String {
        use sha2::{Digest, Sha256};
        format!(
            "{:x}",
            Sha256::digest(self.path.as_os_str().as_encoded_bytes())
        )
    }

    pub fn default_path() -> Result<PathBuf> {
        let base = config_directory(|key| std::env::var_os(key))?;
        Ok(base.join("desktop-rs/repositories.json"))
    }

    pub fn read(&self) -> Result<SavedRepositories> {
        match fs::read(&self.path) {
            Ok(bytes) => {
                let data: SavedRepositories = serde_json::from_slice(&bytes)
                    .context("read repository registry; existing data was not overwritten")?;
                if data.version != 1 {
                    bail!("unsupported repository registry version {}", data.version);
                }
                data.validate()?;
                Ok(data)
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(SavedRepositories {
                version: 1,
                ..Default::default()
            }),
            Err(error) => Err(error.into()),
        }
    }

    /// Call with a root returned by Repository::open. Select and deduplicate atomically.
    pub fn add(&self, root: PathBuf, select: bool) -> Result<SavedRepositories> {
        self.update(move |data| {
            let record = data
                .record_for_path(&root)
                .unwrap_or_else(|| SavedRepositoryRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: root.clone(),
                    account: StoredAccount::default(),
                });
            if !data.repositories.contains(&root) {
                data.repositories.push(root.clone());
            }
            data.persist_record(record);
            if select {
                data.selected = Some(root);
            }
            Ok(())
        })
    }

    pub fn select(&self, root: PathBuf) -> Result<SavedRepositories> {
        self.update(move |data| {
            if !data.repositories.contains(&root) {
                bail!("repository is not saved; add it first");
            }
            let record = data
                .record_for_path(&root)
                .context("Repository is not saved")?;
            data.persist_record(record);
            data.selected = Some(root);
            Ok(())
        })
    }

    /// Select a previously bound record without recreating a forgotten path.
    pub fn select_record(&self, id: &str, expected_path: &Path) -> Result<SavedRepositoryRecord> {
        let mut selected = None;
        self.update(|data| {
            let record = data
                .record_by_id(id)
                .context("Saved repository changed; select it again")?;
            anyhow::ensure!(
                record.path == expected_path,
                "Saved repository working tree changed; select it again"
            );
            data.persist_record(record.clone());
            data.selected = Some(record.path.clone());
            selected = Some(record);
            Ok(())
        })?;
        selected.context("Saved repository was not selected")
    }

    /// Forget metadata only. Repository contents are never removed.
    pub fn forget(&self, root: &Path) -> Result<SavedRepositories> {
        self.update(|data| {
            data.repositories.retain(|path| path != root);
            data.records.retain(|record| record.path != root);
            if data.selected.as_deref() == Some(root) {
                data.selected = None;
            }
            Ok(())
        })
    }

    /// Exact saved-root lookup; legacy entries are synthesized without writing.
    pub fn record_for_path(&self, path: &Path) -> Result<Option<SavedRepositoryRecord>> {
        Ok(self.read()?.record_for_path(path))
    }

    pub fn record_by_id(&self, id: &str) -> Result<Option<SavedRepositoryRecord>> {
        Ok(self.read()?.record_by_id(id))
    }

    /// Publish an account change only if the saved record and revision still exist.
    pub fn compare_and_replace_account(
        &self,
        id: &str,
        expected_revision: u64,
        account: StoredAccount,
    ) -> Result<SavedRepositoryRecord> {
        anyhow::ensure!(
            account.revision
                == expected_revision
                    .checked_add(1)
                    .context("Account revision overflow")?,
            "Invalid replacement account revision"
        );
        let mut updated = None;
        self.update(|data| {
            let mut record = data
                .record_by_id(id)
                .context("Saved repository changed; select it again")?;
            anyhow::ensure!(
                record.account.revision == expected_revision,
                "Repository account changed; load it again"
            );
            record.account = account;
            data.persist_record(record.clone());
            updated = Some(record);
            Ok(())
        })?;
        updated.context("Saved repository account was not updated")
    }

    /// Keep a saved record stable while performing bounded local recovery I/O.
    pub(crate) fn with_record_lock<T>(
        &self,
        id: &str,
        path: &Path,
        work: impl FnOnce() -> Result<T>,
    ) -> Result<T> {
        let _lock = crate::storage::lock(&self.path)?;
        let record = self
            .read()?
            .record_by_id(id)
            .context("Saved repository changed; select it again")?;
        anyhow::ensure!(
            record.path == path,
            "Saved repository working tree changed; select it again"
        );
        work()
    }

    /// Adopt an existing target record, otherwise relocate the source record intact.
    /// The caller must first verify native Git worktree membership.
    pub fn switch_worktree(
        &self,
        source_id: Option<&str>,
        target: PathBuf,
    ) -> Result<SavedRepositoryRecord> {
        let source = source_id
            .map(|id| {
                self.record_by_id(id)?
                    .context("Saved repository changed; select it again")
            })
            .transpose()?;
        self.switch_worktree_record(source.as_ref(), target)
    }

    pub(crate) fn switch_worktree_record(
        &self,
        source: Option<&SavedRepositoryRecord>,
        target: PathBuf,
    ) -> Result<SavedRepositoryRecord> {
        let mut selected = None;
        self.update(|data| {
            let source = source
                .map(|expected| {
                    let record = data
                        .record_by_id(&expected.id)
                        .context("Saved repository changed; select it again")?;
                    anyhow::ensure!(
                        record.path == expected.path,
                        "Saved repository working tree changed; select it again"
                    );
                    Ok::<_, anyhow::Error>(record)
                })
                .transpose()?;
            let record = if let Some(record) = data.record_for_path(&target) {
                record
            } else if let Some(mut source) = source {
                let previous = source.path.clone();
                source.path = target.clone();
                for path in &mut data.repositories {
                    if *path == previous {
                        *path = target.clone();
                    }
                }
                source
            } else {
                data.repositories.push(target.clone());
                SavedRepositoryRecord {
                    id: uuid::Uuid::new_v4().to_string(),
                    path: target.clone(),
                    account: StoredAccount::default(),
                }
            };
            data.persist_record(record.clone());
            data.selected = Some(target);
            selected = Some(record);
            Ok(())
        })?;
        selected.context("Working tree was not selected")
    }

    fn update(
        &self,
        action: impl FnOnce(&mut SavedRepositories) -> Result<()>,
    ) -> Result<SavedRepositories> {
        crate::storage::update(
            &self.path,
            || self.read(),
            |data| {
                action(data)?;
                data.validate()
            },
        )
    }
    /// Publication intents live in the private registry, not in an untrusted Git directory.
    /// Use the same lock filename as ordinary updates, but open every file without
    /// following symlinks and replace the registry relative to the checked directory.
    pub(crate) fn publication_store<T>(
        &self,
        repository: &Path,
        git_directory: &Path,
        common_directory: &Path,
        write: bool,
        work: impl FnOnce(&mut SavedRepositories) -> Result<T>,
    ) -> Result<T> {
        use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
        use cap_std::{
            ambient_authority,
            fs::{Dir, OpenOptions},
        };
        use std::io::{Read, Write};
        let parent = self.path.parent().context("Invalid publication registry")?;
        let canonical = parent
            .canonicalize()
            .context("Invalid publication registry")?;
        let worktree = repository.canonicalize().context("Invalid repository")?;
        let git = git_directory
            .canonicalize()
            .context("Invalid Git directory")?;
        let common = common_directory
            .canonicalize()
            .context("Invalid Git common directory")?;
        anyhow::ensure!(
            canonical == parent
                && !canonical.starts_with(&worktree)
                && !canonical.starts_with(&git)
                && !canonical.starts_with(&common),
            "Publication registry must be outside the repository"
        );
        // Resolve every component through an already-open directory, preventing
        // a symlink replacement between validation and opening the registry.
        #[cfg(unix)]
        let dir = {
            use std::path::Component;
            let mut directory = Dir::open_ambient_dir("/", ambient_authority())?;
            for component in parent.components() {
                match component {
                    Component::RootDir => {}
                    Component::Normal(name) => {
                        directory = directory
                            .open_dir_nofollow(name)
                            .map_err(|_| anyhow::anyhow!("Invalid publication registry"))?
                    }
                    _ => anyhow::bail!("Invalid publication registry"),
                }
            }
            use std::os::unix::fs::MetadataExt;
            let metadata = directory.open(".")?.into_std().metadata()?;
            anyhow::ensure!(
                metadata.uid() == unsafe { libc::geteuid() } && metadata.mode() & 0o022 == 0,
                "Publication registry directory must be private"
            );
            directory
        };
        #[cfg(not(unix))]
        let dir: Dir = { anyhow::bail!("Publication registry is unavailable on this platform") };
        let file_name = self
            .path
            .file_name()
            .context("Invalid publication registry")?;
        let lock_path = self.path.with_extension("lock");
        let lock_name = lock_path
            .file_name()
            .context("Invalid publication registry")?;
        let mut lock_options = OpenOptions::new();
        lock_options
            .read(true)
            .write(true)
            .follow(FollowSymlinks::No);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            lock_options.custom_flags(libc::O_NONBLOCK);
        }
        let lock = dir.open_with(lock_name, &lock_options)?.into_std();
        anyhow::ensure!(
            lock.metadata()?.is_file(),
            "Invalid publication registry lock"
        );
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            anyhow::ensure!(
                lock.metadata()?.nlink() == 1
                    && lock.metadata()?.uid() == unsafe { libc::geteuid() }
                    && lock.metadata()?.mode() & 0o077 == 0,
                "Invalid publication registry lock"
            );
        }
        loop {
            crate::cancellation::Cancellation::current().check()?;
            match lock.try_lock() {
                Ok(()) => break,
                Err(std::fs::TryLockError::WouldBlock) => {
                    std::thread::sleep(std::time::Duration::from_millis(10))
                }
                Err(std::fs::TryLockError::Error(_)) => {
                    anyhow::bail!("Cannot lock publication registry")
                }
            }
        }
        let mut options = OpenOptions::new();
        options.read(true).follow(FollowSymlinks::No);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NONBLOCK);
        }
        let mut file = dir.open_with(file_name, &options)?.into_std();
        let metadata = file.metadata()?;
        anyhow::ensure!(metadata.is_file(), "Invalid publication registry");
        #[cfg(unix)]
        {
            use std::os::unix::fs::MetadataExt;
            anyhow::ensure!(
                metadata.nlink() == 1
                    && metadata.uid() == unsafe { libc::geteuid() }
                    && metadata.mode() & 0o077 == 0,
                "Publication registry must be private"
            );
        }
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(16 * 1024 * 1024 + 1)
            .read_to_end(&mut bytes)?;
        anyhow::ensure!(
            bytes.len() <= 16 * 1024 * 1024,
            "Publication registry is too large"
        );
        let mut data: SavedRepositories = serde_json::from_slice(&bytes)
            .map_err(|_| anyhow::anyhow!("Invalid publication registry"))?;
        anyhow::ensure!(data.version == 1, "Invalid publication registry");
        data.validate()?;
        let result = work(&mut data)?;
        if write {
            data.validate()?;
            let encoded = serde_json::to_vec_pretty(&data)?;
            anyhow::ensure!(
                encoded.len() <= 16 * 1024 * 1024,
                "Publication registry is too large"
            );
            let tmp = format!(".publication-{}.tmp", uuid::Uuid::new_v4());
            let mut options = OpenOptions::new();
            options
                .write(true)
                .create_new(true)
                .follow(FollowSymlinks::No);
            #[cfg(unix)]
            {
                use cap_std::fs::OpenOptionsExt;
                options.mode(0o600).custom_flags(libc::O_NONBLOCK);
            }
            let saved = (|| -> Result<()> {
                let mut output = dir.open_with(&tmp, &options)?;
                output.write_all(&encoded)?;
                output.write_all(b"\n")?;
                output.sync_all()?;
                dir.rename(&tmp, &dir, file_name)?;
                dir.open(".")?.into_std().sync_all()?;
                Ok(())
            })();
            if saved.is_err() {
                let _ = dir.remove_file(&tmp);
            }
            saved.map_err(|_| anyhow::anyhow!("Cannot persist publication registry"))?;
        }
        Ok(result)
    }

    pub(crate) fn publication_record_matches(
        data: &SavedRepositories,
        id: &str,
        path: &Path,
    ) -> bool {
        data.record_by_id(id)
            .is_some_and(|record| record.path == path)
    }

    pub fn preferences(&self) -> crate::PreferencesStore {
        crate::PreferencesStore::new(self.path.with_extension("preferences.json"))
    }
}

/// Initialize a new working tree without reinitializing an existing repository.
pub async fn initialize(path: &Path) -> Result<Repository> {
    let destination = prepare_destination(path)?;
    let parent = destination
        .parent()
        .context("repository needs a parent directory")?;
    let policy = process::run(parent, &args(&["config", "--get", "init.defaultbranch"])).await?;
    if !matches!(policy.code, 0 | 1) {
        bail!("{}", policy.text().stderr);
    }
    let mut command = args(&["init"]);
    if policy.code == 1 {
        command.push("--initial-branch=main".into());
    }
    command.push("--".into());
    command.push(destination.as_os_str().to_owned());
    let output = process::run(parent, &command).await?;
    if output.code != 0 {
        bail!("{}", output.text().stderr);
    }
    Repository::open(&destination).await
}

/// Clone using system Git and its credential configuration. No secrets enter the registry.
pub async fn clone_repository(url: &str, path: &Path) -> Result<Repository> {
    if url.is_empty()
        || url.starts_with('-')
        || url.contains(['\0', '\n', '\r'])
        || url.starts_with("ext::")
    {
        bail!("invalid clone URL");
    }
    let destination = prepare_destination(path)?;
    let parent = destination
        .parent()
        .context("repository needs a parent directory")?;
    let mut command = args(&["clone", "--", url]);
    command.push(destination.as_os_str().to_owned());
    let output = process::run(parent, &command).await?;
    if output.code != 0 {
        bail!("{}", output.text().stderr);
    }
    Repository::open(&destination).await
}

fn prepare_destination(path: &Path) -> Result<PathBuf> {
    let absolute = if path.is_absolute() {
        path.to_path_buf()
    } else {
        std::env::current_dir()?.join(path)
    };
    if absolute.exists() && (!absolute.is_dir() || fs::read_dir(&absolute)?.next().is_some()) {
        bail!("destination must be absent or an empty directory");
    }
    let parent = absolute
        .parent()
        .context("destination needs a parent directory")?;
    fs::create_dir_all(parent)?;
    let name = absolute
        .file_name()
        .context("destination needs a directory name")?;
    Ok(parent.canonicalize()?.join(name))
}

/// Keep native configuration independent of Electron and available without HOME on Windows.
fn config_directory(mut env: impl FnMut(&str) -> Option<std::ffi::OsString>) -> Result<PathBuf> {
    let mut nonempty = |key: &str| env(key).filter(|value| !value.is_empty());
    let base = match nonempty("XDG_CONFIG_HOME") {
        Some(path) => PathBuf::from(path),
        None => {
            #[cfg(target_os = "windows")]
            {
                PathBuf::from(
                    nonempty("LOCALAPPDATA")
                        .context("LOCALAPPDATA is not set; provide --config")?,
                )
            }
            #[cfg(not(target_os = "windows"))]
            {
                let home =
                    PathBuf::from(nonempty("HOME").context("HOME is not set; provide --config")?);
                #[cfg(target_os = "macos")]
                {
                    home.join("Library/Application Support")
                }
                #[cfg(not(target_os = "macos"))]
                {
                    home.join(".config")
                }
            }
        }
    };
    if !base.is_absolute() {
        bail!("configuration directory must be absolute; provide --config");
    }
    Ok(base)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;

    struct RegistryFixture {
        directory: PathBuf,
        registry: Registry,
    }
    impl RegistryFixture {
        fn new() -> Self {
            let directory =
                std::env::temp_dir().join(format!("desktop-registry-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(&directory).unwrap();
            Self {
                registry: Registry::new(directory.join("registry.json")),
                directory,
            }
        }
    }
    impl Drop for RegistryFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.directory);
        }
    }
    fn disable_account(
        registry: &Registry,
        record: &SavedRepositoryRecord,
    ) -> SavedRepositoryRecord {
        registry
            .compare_and_replace_account(
                &record.id,
                record.account.revision,
                StoredAccount {
                    revision: record.account.revision + 1,
                    assignment: crate::accounts::AccountAssignment::None {},
                    association: None,
                    source_remote: record.account.source_remote.clone(),
                },
            )
            .unwrap()
    }

    #[test]
    fn publication_identity_requires_matching_actor_and_reviewed_source() {
        let mut identity = PublicationIdentity {
            host: "github.com".into(),
            owner: "Alice".into(),
            name: "project".into(),
            actor_login: "Alice".into(),
            actor_id: 42,
            owner_id: 42,
            target: crate::AccountTarget::Assigned {
                host: "github.com".into(),
                login: "Alice".into(),
            },
            account_basis: "a".repeat(64),
            source_fingerprint: "b".repeat(64),
        };
        assert!(identity.validate().is_ok());
        let hash = identity.destination_hash().unwrap();
        identity.owner = "ALICE".into();
        assert_eq!(identity.destination_hash().unwrap(), hash);
        identity.owner_id = 43;
        assert!(identity.validate().is_err());
        identity.owner_id = 42;
        identity.target = crate::AccountTarget::None {};
        assert!(identity.validate().is_err());
        identity.target = crate::AccountTarget::Effective {};
        identity.source_fingerprint = "invalid".into();
        assert!(identity.validate().is_err());
    }

    #[test]
    fn publication_ledger_is_persistent_but_omitted_from_public_views() {
        let fixture = RegistryFixture::new();
        let path = fixture.directory.join("repo");
        fixture.registry.add(path.clone(), true).unwrap();
        let record = fixture.registry.record_for_path(&path).unwrap().unwrap();
        let mut data = fixture.registry.read().unwrap();
        data.publication_intents.push(PublicationIntent {
            id: uuid::Uuid::new_v4().to_string(),
            repository_id: "a".repeat(64),
            common_id: "b".repeat(64),
            record_id: record.id,
            phase: "created".into(),
            destination_hash: "c".repeat(64),
            remote_id: Some(8_765_432_109_876_543),
            acknowledged: false,
            identity: None,
        });
        fs::write(&fixture.registry.path, serde_json::to_vec(&data).unwrap()).unwrap();
        let loaded = fixture.registry.read().unwrap();
        assert_eq!(loaded.publication_intents.len(), 1);
        let persisted = serde_json::to_value(&loaded).unwrap();
        let view = loaded.public_view().unwrap();
        assert!(persisted.get("publication_intents").is_some());
        assert!(view.get("publication_intents").is_none());
        for key in ["version", "selected", "repositories", "records"] {
            assert_eq!(view.get(key), persisted.get(key));
        }
        assert!(!view.to_string().contains("8765432109876543"));
        fixture.registry.forget(&path).unwrap();
        let retained = fixture.registry.read().unwrap();
        assert_eq!(retained.publication_intents.len(), 1);
        assert!(
            retained
                .public_view()
                .unwrap()
                .get("publication_intents")
                .is_none()
        );
    }

    #[test]
    fn legacy_record_lookup_is_read_only_and_account_upgrade_keeps_identity() {
        let fixture = RegistryFixture::new();
        let path = fixture.directory.join("repo");
        let original = serde_json::to_vec(
            &serde_json::json!({"version":1,"selected":path,"repositories":[path]}),
        )
        .unwrap();
        fs::write(&fixture.registry.path, &original).unwrap();
        let record = fixture.registry.record_for_path(&path).unwrap().unwrap();
        assert_eq!(record.id, legacy_id(&path));
        assert_eq!(
            fixture
                .registry
                .record_by_id(&record.id)
                .unwrap()
                .unwrap()
                .path,
            path
        );
        assert_eq!(fs::read(&fixture.registry.path).unwrap(), original);
        let updated = disable_account(&fixture.registry, &record);
        assert_eq!(updated.id, record.id);
        assert_eq!(fixture.registry.read().unwrap().records.len(), 1);
        let after = fs::read(&fixture.registry.path).unwrap();
        assert!(
            fixture
                .registry
                .compare_and_replace_account(
                    &record.id,
                    0,
                    StoredAccount {
                        revision: 1,
                        ..Default::default()
                    }
                )
                .is_err()
        );
        assert_eq!(fs::read(&fixture.registry.path).unwrap(), after);
    }

    #[test]
    fn worktree_switch_relocates_source_and_adopts_an_existing_target() {
        let fixture = RegistryFixture::new();
        let source = fixture.directory.join("source");
        let target = fixture.directory.join("target");
        let other = fixture.directory.join("other");
        fixture.registry.add(source.clone(), true).unwrap();
        let reviewed_source = fixture.registry.record_for_path(&source).unwrap().unwrap();
        let source_record = disable_account(&fixture.registry, &reviewed_source);
        let relocated = fixture
            .registry
            .switch_worktree_record(Some(&reviewed_source), target.clone())
            .unwrap();
        assert_eq!(relocated.id, source_record.id);
        assert_eq!(relocated.account.revision, 1);
        assert!(
            fixture
                .registry
                .switch_worktree_record(Some(&source_record), other.clone())
                .is_err()
        );
        assert!(matches!(
            relocated.account.assignment,
            crate::accounts::AccountAssignment::None {}
        ));
        assert!(fixture.registry.record_for_path(&source).unwrap().is_none());
        assert_eq!(
            fixture.registry.read().unwrap().repositories,
            vec![target.clone()]
        );
        assert!(
            fixture
                .registry
                .select_record(&source_record.id, &source)
                .is_err()
        );
        fixture.registry.add(other.clone(), false).unwrap();
        let other_record = fixture.registry.record_for_path(&other).unwrap().unwrap();
        let adopted = fixture
            .registry
            .switch_worktree(Some(&relocated.id), other.clone())
            .unwrap();
        assert_eq!(adopted.id, other_record.id);
        assert_eq!(adopted.account.revision, 0);
        assert_eq!(
            fixture
                .registry
                .record_by_id(&relocated.id)
                .unwrap()
                .unwrap()
                .path,
            target
        );
        assert_eq!(fixture.registry.read().unwrap().selected, Some(other));
    }

    #[test]
    fn forget_and_readd_never_revives_an_old_bound_record() {
        let fixture = RegistryFixture::new();
        let path = fixture.directory.join("repo");
        fixture.registry.add(path.clone(), true).unwrap();
        let old = fixture.registry.record_for_path(&path).unwrap().unwrap();
        fixture.registry.forget(&path).unwrap();
        assert!(fixture.registry.select_record(&old.id, &path).is_err());
        assert!(fixture.registry.record_by_id(&old.id).unwrap().is_none());
        fixture.registry.add(path.clone(), true).unwrap();
        let new = fixture.registry.record_for_path(&path).unwrap().unwrap();
        assert_ne!(new.id, old.id);
        assert!(
            fixture
                .registry
                .compare_and_replace_account(
                    &old.id,
                    0,
                    StoredAccount {
                        revision: 1,
                        ..Default::default()
                    }
                )
                .is_err()
        );
    }

    #[test]
    fn registry_rejects_duplicate_and_unrelated_records() {
        let fixture = RegistryFixture::new();
        let path = fixture.directory.join("repo");
        fixture.registry.add(path.clone(), true).unwrap();
        let mut data = fixture.registry.read().unwrap();
        data.records.push(data.records[0].clone());
        assert!(data.validate().is_err());
        data.records.pop();
        data.records[0].path = fixture.directory.join("unsaved");
        assert!(data.validate().is_err());
        data.records.clear();
        data.selected = Some(fixture.directory.join("unsaved"));
        assert!(data.validate().is_err());
    }

    #[test]
    fn malformed_present_account_records_never_default_to_effective() {
        let fixture = RegistryFixture::new();
        let path = fixture.directory.join("repo");
        fixture.registry.add(path, true).unwrap();
        let original = serde_json::to_value(fixture.registry.read().unwrap()).unwrap();
        let mut older = original.clone();
        older["records"][0]["account"]
            .as_object_mut()
            .unwrap()
            .remove("source_remote");
        let older_bytes = serde_json::to_vec(&older).unwrap();
        fs::write(&fixture.registry.path, &older_bytes).unwrap();
        let older = fixture.registry.read().unwrap();
        assert!(older.records[0].account.source_remote.is_none());
        assert_eq!(fs::read(&fixture.registry.path).unwrap(), older_bytes);
        for malformed in 0..5 {
            let mut data = original.clone();
            let record = data["records"][0].as_object_mut().unwrap();
            match malformed {
                0 => {
                    record.remove("account");
                }
                1 => {
                    record["account"]
                        .as_object_mut()
                        .unwrap()
                        .remove("assignment");
                }
                2 => {
                    record["account"]["assignment"] = serde_json::json!({"mode":"unknown"});
                }
                3 => {
                    record["account"]["assignment"] = serde_json::json!({"mode":"assigned","host":"github.com","login":"account"});
                }
                4 => {
                    record["account"]["assignment"] = serde_json::json!({"mode":"assigned","host":"github.com","login":"account","id":0});
                }
                _ => unreachable!(),
            }
            let bytes = serde_json::to_vec(&data).unwrap();
            fs::write(&fixture.registry.path, &bytes).unwrap();
            assert!(
                fixture.registry.read().is_err(),
                "malformed account case {malformed}"
            );
            assert_eq!(fs::read(&fixture.registry.path).unwrap(), bytes);
        }
    }

    #[cfg(unix)]
    #[test]
    fn record_paths_preserve_distinct_native_bytes() {
        use std::os::unix::ffi::OsStringExt;
        let fixture = RegistryFixture::new();
        let first = fixture
            .directory
            .join(std::ffi::OsString::from_vec(b"repo-\xff".to_vec()));
        let second = fixture
            .directory
            .join(std::ffi::OsString::from_vec(b"repo-\xfe".to_vec()));
        fixture.registry.add(first.clone(), true).unwrap();
        fixture.registry.add(second.clone(), false).unwrap();
        let left = fixture.registry.record_for_path(&first).unwrap().unwrap();
        let right = fixture.registry.record_for_path(&second).unwrap().unwrap();
        assert_ne!(left.id, right.id);
        assert_eq!(
            fixture
                .registry
                .record_by_id(&left.id)
                .unwrap()
                .unwrap()
                .path,
            first
        );
        assert_eq!(
            fixture
                .registry
                .record_by_id(&right.id)
                .unwrap()
                .unwrap()
                .path,
            second
        );
        assert_ne!(
            fixture.registry.namespace_id(),
            Registry::new(fixture.directory.join("other.json")).namespace_id()
        );
    }

    #[test]
    fn config_paths_honor_explicit_override_and_native_location() {
        let home = std::env::temp_dir().join("desktop-home");
        let local = std::env::temp_dir().join("desktop-local-app-data");
        let explicit = std::env::temp_dir().join("desktop-explicit");
        assert_eq!(
            config_directory(|key| match key {
                "XDG_CONFIG_HOME" => Some(explicit.clone().into_os_string()),
                _ => None,
            })
            .unwrap(),
            explicit
        );
        assert!(config_directory(|_| None).is_err());
        assert!(
            config_directory(|key| (key == "XDG_CONFIG_HOME").then(|| OsString::from("relative")))
                .is_err()
        );
        let native = config_directory(|key| match key {
            "XDG_CONFIG_HOME" => Some(OsString::new()),
            "HOME" => Some(home.clone().into_os_string()),
            "LOCALAPPDATA" => Some(local.clone().into_os_string()),
            _ => None,
        })
        .unwrap();
        #[cfg(target_os = "windows")]
        assert_eq!(native, local);
        #[cfg(target_os = "macos")]
        assert_eq!(native, home.join("Library/Application Support"));
        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        assert_eq!(native, home.join(".config"));
    }
}
