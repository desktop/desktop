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
    fn record_by_id(&self, id: &str) -> Option<SavedRepositoryRecord> {
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
    fn persist_record(&mut self, record: SavedRepositoryRecord) {
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
