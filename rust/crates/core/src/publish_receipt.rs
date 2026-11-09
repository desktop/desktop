//! Private, durable publication recovery records. No network operations occur here.
use crate::{Repository, cancellation};
use anyhow::{Context, Result, ensure};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Write},
    path::Path,
};

const DIRECTORY: &str = "desktop-publish-receipts";
const LIMIT: u64 = 64 * 1024;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum Phase {
    CreationUnknown,
    Created,
    OriginUnknown,
    OriginAdded,
    AssignmentUnknown,
    AccountAssigned,
    PushDefaultUnknown,
    PushedDefault,
    PushCurrentUnknown,
    PushedCurrent,
    Complete,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
enum ErrorCode {
    Network,
    Validation,
    AccountChanged,
    Git,
    Storage,
    Cancelled,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u32,
    id: String,
    repository_id: String,
    namespace: String,
    record_id: String,
    phase: Phase,
    host: String,
    owner: String,
    name: String,
    error: Option<ErrorCode>,
    acknowledged: bool,
}
#[derive(Clone)]
struct Scope {
    repository_id: String,
    common_id: String,
    common_dir: std::path::PathBuf,
    namespace: String,
    record_id: String,
}
impl Scope {
    fn directory_name(&self) -> Result<String> {
        Ok(format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(&self.namespace, &self.record_id))?)
        ))
    }
}
fn valid_id(id: &str) -> bool {
    uuid::Uuid::parse_str(id).is_ok_and(|parsed| parsed.to_string() == id)
}
fn open_directory(root: &Path, scope: &Scope) -> Result<Option<Dir>> {
    let root = Dir::open_ambient_dir(root, ambient_authority())?;
    let parent = match root.open_dir_nofollow(DIRECTORY) {
        Ok(dir) => dir,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => anyhow::bail!("Cannot access publication recovery directory"),
    };
    match parent.open_dir_nofollow(scope.directory_name()?) {
        Ok(dir) => Ok(Some(dir)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => anyhow::bail!("Cannot access publication recovery directory"),
    }
}
fn read(dir: &Dir, id: &str, scope: &Scope) -> Result<Receipt> {
    ensure!(valid_id(id), "Invalid publication receipt ID");
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = dir
        .open_with(format!("{id}.json"), &options)
        .map_err(|_| anyhow::anyhow!("Cannot read publication receipt"))?;
    ensure!(file.metadata()?.is_file(), "Invalid publication receipt");
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(LIMIT + 1)
        .read_to_end(&mut bytes)?;
    ensure!(bytes.len() <= LIMIT as usize, "Invalid publication receipt");
    let receipt: Receipt = serde_json::from_slice(&bytes)
        .map_err(|_| anyhow::anyhow!("Invalid publication receipt"))?;
    ensure!(
        receipt.version == 1
            && receipt.id == id
            && receipt.repository_id == scope.repository_id
            && receipt.namespace == scope.namespace
            && receipt.record_id == scope.record_id,
        "Invalid publication receipt"
    );
    crate::github::validate_repository(&format!(
        "{}/{}/{}",
        receipt.host, receipt.owner, receipt.name
    ))
    .map_err(|_| anyhow::anyhow!("Invalid publication receipt"))?;
    ensure!(
        receipt.host.len() <= 253 && receipt.owner.len() <= 256 && receipt.name.len() <= 100,
        "Invalid publication receipt"
    );
    Ok(receipt)
}
fn view(receipt: &Receipt) -> Value {
    let error = receipt.error.as_ref().map(|code| match code {
        ErrorCode::Network => "A network operation did not complete",
        ErrorCode::Validation => "Publication verification did not complete",
        ErrorCode::AccountChanged => "The selected repository account changed",
        ErrorCode::Git => "A Git operation did not complete",
        ErrorCode::Storage => "Publication recovery storage failed",
        ErrorCode::Cancelled => "The operation was interrupted",
    });
    json!({"id":receipt.id,"phase":receipt.phase,"url":null,"error":error,"acknowledged":receipt.acknowledged})
}
fn write(dir: &Dir, receipt: &Receipt) -> Result<()> {
    let bytes = serde_json::to_vec(receipt)?;
    ensure!(bytes.len() <= LIMIT as usize, "Invalid publication receipt");
    let tmp = format!(".{}.tmp", uuid::Uuid::new_v4());
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
    let result = (|| -> Result<()> {
        let mut file = dir.open_with(&tmp, &options)?;
        file.write_all(&bytes)?;
        file.sync_all()?;
        dir.rename(&tmp, dir, format!("{}.json", receipt.id))?;
        dir.open(".")?.into_std().sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = dir.remove_file(&tmp);
    }
    result.map_err(|_| anyhow::anyhow!("Cannot persist publication receipt"))
}
fn history(root: &Path, scope: &Scope) -> Result<Value> {
    let Some(dir) = open_directory(root, scope)? else {
        return Ok(json!({"receipts":[]}));
    };
    let mut rows = Vec::new();
    for entry in dir.entries()? {
        let name = entry?.file_name();
        let Some(name) = name.to_str() else { continue };
        let Some(id) = name.strip_suffix(".json") else {
            continue;
        };
        if !valid_id(id) {
            continue;
        }
        ensure!(
            rows.len() < 1000,
            "Publication history exceeds the supported limit"
        );
        rows.push(match read(&dir, id, scope) {
            Ok(receipt) => view(&receipt),
            Err(_) => json!({"id":id,"phase":"unreadable","url":null,"error":"Cannot read publication receipt","acknowledged":false}),
        });
    }
    rows.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
    Ok(json!({"receipts":rows}))
}
fn matches_scope(intent: &crate::registry::PublicationIntent, scope: &Scope) -> bool {
    intent.repository_id == scope.repository_id
        || intent.record_id == scope.record_id
        || (!intent.common_id.is_empty() && intent.common_id == scope.common_id)
}

// An older authoritative entry without a common-directory witness blocks new
// creation conservatively, but is not exposed in unrelated repository history.
fn blocks_scope(intent: &crate::registry::PublicationIntent, scope: &Scope) -> bool {
    intent.common_id.is_empty() || matches_scope(intent, scope)
}

fn intent_view(intent: &crate::registry::PublicationIntent) -> Value {
    json!({"id":intent.id,"phase":intent.phase,"url":null,"error":null,"acknowledged":intent.acknowledged})
}

impl Repository {
    /// A dry-run never creates or repairs the authoritative store.
    pub(crate) async fn publish_creation_available(&self) -> Result<bool> {
        let Some((root, scope, registry, path)) = self.publish_receipt_scope().await? else {
            return Ok(false);
        };
        let result = cancellation::blocking(move || {
            registry.publication_store(&path, &root, &scope.common_dir, false, |data| {
                ensure!(
                    crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                    "Saved repository changed"
                );
                let old = history(&root, &scope)?;
                Ok(old["receipts"]
                    .as_array()
                    .is_some_and(|rows| rows.is_empty())
                    && !data
                        .publication_intents
                        .iter()
                        .any(|item| blocks_scope(item, &scope)))
            })
        })
        .await;
        match result {
            Ok(value) => Ok(value),
            Err(_) => {
                crate::cancellation::Cancellation::current().check()?;
                Ok(false)
            }
        }
    }

    /// Persist the unknown outcome before any network mutation. The caller owns
    /// the shared repository lock; the registry lock serializes other processes.
    pub(crate) async fn prepare_publish_receipt(
        &self,
        identity: crate::registry::PublicationIdentity,
    ) -> Result<String> {
        identity.validate()?;
        let Some((root, scope, registry, path)) = self.publish_receipt_scope().await? else {
            anyhow::bail!("Save the repository before publishing")
        };
        let destination_hash = identity.destination_hash()?;
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &scope.common_dir, true, |data| {
                ensure!(
                    crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                    "Saved repository changed"
                );
                ensure!(
                    history(&root, &scope)?["receipts"]
                        .as_array()
                        .is_some_and(|rows| rows.is_empty()),
                    "Publication requires reconciliation"
                );
                ensure!(
                    !data
                        .publication_intents
                        .iter()
                        .any(|item| blocks_scope(item, &scope)),
                    "Publication requires reconciliation"
                );
                let id = uuid::Uuid::new_v4().to_string();
                data.publication_intents
                    .push(crate::registry::PublicationIntent {
                        id: id.clone(),
                        repository_id: scope.repository_id.clone(),
                        common_id: scope.common_id.clone(),
                        record_id: scope.record_id.clone(),
                        phase: "creation_unknown".into(),
                        destination_hash,
                        remote_id: None,
                        acknowledged: false,
                        identity: Some(identity),
                    });
                Ok(id)
            })
        })
        .await
    }

    /// Read only an authoritative, verified-created receipt for the same saved record.
    pub(crate) async fn publish_created_intent(
        &self,
        id: &str,
    ) -> Result<crate::registry::PublicationIntent> {
        ensure!(valid_id(id), "Invalid publication receipt ID");
        let (root, scope, registry, path) = self
            .publish_receipt_scope()
            .await?
            .context("Save the repository before reviewing publication")?;
        let id = id.to_owned();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &scope.common_dir, false, |data| {
                ensure!(
                    crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                    "Saved repository changed"
                );
                let item = data
                    .publication_intents
                    .iter()
                    .find(|item| {
                        item.id == id
                            && matches_scope(item, &scope)
                            && item.record_id == scope.record_id
                    })
                    .context("Publication receipt is unavailable for this saved repository")?;
                ensure!(
                    item.phase == "created" && item.remote_id.is_some() && item.identity.is_some(),
                    "Only a verified created repository with retained identity can be reviewed"
                );
                Ok(item.clone())
            })
        })
        .await
    }

    /// Read a phase only from the authoritative private ledger, never local receipts.
    pub(crate) async fn publication_intent_phase(&self, id: &str) -> Result<Option<String>> {
        ensure!(valid_id(id), "Invalid publication receipt ID");
        let (root, scope, registry, path) = self
            .publish_receipt_scope()
            .await?
            .context("Saved repository is unavailable")?;
        let id = id.to_owned();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &scope.common_dir, false, |data| {
                ensure!(
                    crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                    "Saved repository changed"
                );
                Ok(data
                    .publication_intents
                    .iter()
                    .find(|item| item.id == id && matches_scope(item, &scope))
                    .map(|item| item.phase.clone()))
            })
        })
        .await
    }

    /// Persist a publication phase only while the original account record remains unchanged.
    pub(crate) async fn transition_publish_intent(
        &self,
        expected: &crate::registry::PublicationIntent,
        account: &crate::registry::SavedRepositoryRecord,
        phase: &'static str,
    ) -> Result<crate::registry::PublicationIntent> {
        ensure!(
            matches!(
                (expected.phase.as_str(), phase),
                ("created", "origin_unknown")
                    | ("origin_unknown", "origin_added")
                    | ("origin_added", "assignment_unknown")
            ),
            "Invalid publication phase transition"
        );
        let registry = self
            .account_registry()
            .context("Missing repository registry")?
            .clone();
        let root = self.git_directory().await?;
        let common = self.common_directory().await?;
        let path = self.path().to_owned();
        let expected = expected.clone();
        let account = account.clone();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &common, true, |data| {
                let record = data
                    .record_by_id(&account.id)
                    .context("Saved repository changed")?;
                ensure!(
                    record.path == path
                        && serde_json::to_vec(&record.account)?
                            == serde_json::to_vec(&account.account)?,
                    "Repository account changed; inspect publication history"
                );
                let item = data
                    .publication_intents
                    .iter_mut()
                    .find(|item| item.id == expected.id)
                    .context("Publication recovery state changed")?;
                ensure!(
                    serde_json::to_vec(&*item)? == serde_json::to_vec(&expected)?,
                    "Publication recovery state changed"
                );
                item.phase = phase.into();
                Ok(item.clone())
            })
        })
        .await
    }

    /// Commit the account replacement and the confirmed phase in one registry transaction.
    pub(crate) async fn assign_publish_account(
        &self,
        expected: &crate::registry::PublicationIntent,
        account: &crate::registry::SavedRepositoryRecord,
        replacement: crate::StoredAccount,
        expected_config: &crate::publish_origin::OriginConfigSnapshot,
    ) -> Result<crate::registry::PublicationIntent> {
        ensure!(
            expected.phase == "assignment_unknown",
            "Invalid publication phase transition"
        );
        replacement.validate()?;
        ensure!(
            replacement.revision
                == account
                    .account
                    .revision
                    .checked_add(1)
                    .context("Account revision overflow")?,
            "Invalid publication account revision"
        );
        let registry = self
            .account_registry()
            .context("Missing repository registry")?
            .clone();
        let root = self.git_directory().await?;
        let common = self.common_directory().await?;
        let path = self.path().to_owned();
        let expected = expected.clone();
        let account = account.clone();
        let expected_config = expected_config.clone();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &common, true, |data| {
                ensure!(
                    crate::publish_origin::capture(&path)? == expected_config,
                    "Git configuration changed; inspect publication history"
                );
                let mut record = data
                    .record_by_id(&account.id)
                    .context("Saved repository changed")?;
                ensure!(
                    record.path == path
                        && serde_json::to_vec(&record.account)?
                            == serde_json::to_vec(&account.account)?,
                    "Repository account changed; inspect publication history"
                );
                let position = data
                    .publication_intents
                    .iter()
                    .position(|item| item.id == expected.id)
                    .context("Publication recovery state changed")?;
                ensure!(
                    serde_json::to_vec(&data.publication_intents[position])?
                        == serde_json::to_vec(&expected)?,
                    "Publication recovery state changed"
                );
                record.account = replacement;
                data.persist_record(record);
                let item = &mut data.publication_intents[position];
                item.phase = "account_assigned".into();
                Ok(item.clone())
            })
        })
        .await
    }

    /// Ensure that the authoritative unknown outcome is still durable before POST.
    pub(crate) async fn ensure_publish_receipt(&self, id: &str) -> Result<()> {
        ensure!(valid_id(id), "Invalid publication receipt");
        let registry = self
            .account_registry()
            .context("Missing repository registry")?
            .clone();
        let root = self.git_directory().await?;
        let common = self.common_directory().await?;
        let path = self.path().to_owned();
        let repository_id = self.id();
        let id = id.to_owned();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &common, false, |data| {
                ensure!(
                    data.publication_intents.iter().any(|item| item.id == id
                        && item.repository_id == repository_id
                        && item.phase == "creation_unknown"
                        && crate::Registry::publication_record_matches(
                            data,
                            &item.record_id,
                            &path
                        )),
                    "Publication recovery state changed"
                );
                Ok(())
            })
        })
        .await
    }

    /// Confirm only the numeric identity validated against the response by the caller.
    pub(crate) async fn finish_publish_receipt(&self, id: &str, remote_id: u64) -> Result<Value> {
        ensure!(
            valid_id(id) && remote_id > 0 && remote_id <= 9_007_199_254_740_991,
            "Invalid publication receipt"
        );
        let registry = self
            .account_registry()
            .context("Missing repository registry")?
            .clone();
        let root = self.git_directory().await?;
        let common = self.common_directory().await?;
        let path = self.path().to_owned();
        let repository_id = self.id();
        let id = id.to_owned();
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &common, true, |data| {
                let item = data
                    .publication_intents
                    .iter_mut()
                    .find(|item| item.id == id && item.repository_id == repository_id)
                    .context("Publication receipt does not exist")?;
                ensure!(
                    item.phase == "creation_unknown",
                    "Publication receipt already completed"
                );
                item.phase = "created".into();
                item.remote_id = Some(remote_id);
                Ok(json!({"receipt":intent_view(item)}))
            })
        })
        .await
    }

    async fn publish_receipt_scope(
        &self,
    ) -> Result<
        Option<(
            std::path::PathBuf,
            Scope,
            crate::Registry,
            std::path::PathBuf,
        )>,
    > {
        let state = self.account_store_state().await?;
        let Some(record) = state.record else {
            return Ok(None);
        };
        let registry = self
            .account_registry()
            .context("Missing repository registry")?
            .clone();
        let common_dir = self.common_directory().await?;
        let scope = Scope {
            repository_id: self.id(),
            common_id: format!(
                "{:x}",
                Sha256::digest(common_dir.as_os_str().as_encoded_bytes())
            ),
            common_dir,
            namespace: registry.namespace_id(),
            record_id: record.id,
        };
        Ok(Some((
            self.git_directory().await?,
            scope,
            registry,
            self.path().to_owned(),
        )))
    }
    pub(crate) async fn publish_history(&self) -> Result<Value> {
        let Some((root, scope, registry, path)) = self.publish_receipt_scope().await? else {
            return Ok(json!({"receipts":[]}));
        };
        cancellation::blocking(move || {
            registry.publication_store(&path, &root, &scope.common_dir, false, |data| {
                ensure!(
                    crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                    "Saved repository changed"
                );
                let mut result = history(&root, &scope)?;
                let rows = result["receipts"]
                    .as_array_mut()
                    .context("Invalid publication history")?;
                // Local files are untrusted. A forged UUID must never create a
                // contradictory second row for an authoritative intent.
                rows.retain(|row| {
                    !row["id"]
                        .as_str()
                        .is_some_and(|id| data.publication_intents.iter().any(|item| item.id == id))
                });
                rows.extend(
                    data.publication_intents
                        .iter()
                        .filter(|item| matches_scope(item, &scope))
                        .map(intent_view),
                );
                rows.sort_by(|a, b| a["id"].as_str().cmp(&b["id"].as_str()));
                Ok(result)
            })
        })
        .await
    }
    pub(crate) async fn acknowledge_publish(&self, id: &str) -> Result<Value> {
        ensure!(valid_id(id), "Invalid publication receipt ID");
        let _lock = self.stash_lock().await?;
        let (root, scope, registry, path) = self
            .publish_receipt_scope()
            .await?
            .context("Save the repository before acknowledging publication")?;
        let id = id.to_owned();
        cancellation::blocking(move || {
            let authoritative =
                registry.publication_store(&path, &root, &scope.common_dir, false, |data| {
                    ensure!(
                        crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                        "Saved repository changed"
                    );
                    Ok(data
                        .publication_intents
                        .iter()
                        .any(|item| matches_scope(item, &scope) && item.id == id))
                })?;
            if authoritative {
                return registry.publication_store(&path, &root, &scope.common_dir, true, |data| {
                    ensure!(
                        crate::Registry::publication_record_matches(data, &scope.record_id, &path),
                        "Saved repository changed"
                    );
                    let item = data
                        .publication_intents
                        .iter_mut()
                        .find(|item| matches_scope(item, &scope) && item.id == id)
                        .context("Publication receipt does not exist")?;
                    item.acknowledged = true;
                    Ok(json!({"receipt":intent_view(item)}))
                });
            }
            registry.with_record_lock(&scope.record_id, &path, || {
                let dir =
                    open_directory(&root, &scope)?.context("Publication receipt does not exist")?;
                let mut receipt = read(&dir, &id, &scope)
                    .map_err(|_| anyhow::anyhow!("Cannot read publication receipt"))?;
                if !receipt.acknowledged {
                    receipt.acknowledged = true;
                    write(&dir, &receipt)?;
                }
                Ok(json!({"receipt":view(&receipt)}))
            })
        })
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn scope() -> Scope {
        Scope {
            repository_id: "root".into(),
            common_id: "common".into(),
            common_dir: std::path::PathBuf::from("/common"),
            namespace: "namespace".into(),
            record_id: "record".into(),
        }
    }
    fn receipt(scope: &Scope) -> Receipt {
        Receipt {
            version: 1,
            id: uuid::Uuid::new_v4().to_string(),
            repository_id: scope.repository_id.clone(),
            namespace: scope.namespace.clone(),
            record_id: scope.record_id.clone(),
            phase: Phase::CreationUnknown,
            host: "github.com".into(),
            owner: "alice".into(),
            name: "project".into(),
            error: Some(ErrorCode::Network),
            acknowledged: false,
        }
    }
    #[test]
    fn durable_receipt_is_scoped_and_unknown_creation_has_no_url() {
        let root = std::env::temp_dir().join(format!("publish-receipt-{}", uuid::Uuid::new_v4()));
        let scope = scope();
        std::fs::create_dir_all(root.join(DIRECTORY).join(scope.directory_name().unwrap()))
            .unwrap();
        let dir = open_directory(&root, &scope).unwrap().unwrap();
        let mut item = receipt(&scope);
        write(&dir, &item).unwrap();
        let read_back = read(&dir, &item.id, &scope).unwrap();
        assert!(view(&read_back)["url"].is_null());
        assert_eq!(
            view(&read_back)["error"],
            "A network operation did not complete"
        );
        let mut wrong = scope.clone();
        wrong.record_id = "other".into();
        assert!(read(&dir, &item.id, &wrong).is_err());
        item.phase = Phase::Created;
        item.acknowledged = true;
        write(&dir, &item).unwrap();
        let row = view(&read(&dir, &item.id, &scope).unwrap());
        assert!(row["url"].is_null());
        assert_eq!(row["acknowledged"], true);
        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    #[cfg(unix)]
    fn history_never_reads_symlink_or_fifo_receipts() {
        use std::{ffi::CString, os::unix::fs::symlink};
        let root = std::env::temp_dir().join(format!("publish-receipt-{}", uuid::Uuid::new_v4()));
        let scope = scope();
        let path = root.join(DIRECTORY).join(scope.directory_name().unwrap());
        std::fs::create_dir_all(&path).unwrap();
        let id = uuid::Uuid::new_v4().to_string();
        let sensitive = root.join("private");
        std::fs::write(&sensitive, "PRIVATE-MARKER").unwrap();
        let file = path.join(format!("{id}.json"));
        symlink(&sensitive, &file).unwrap();
        let result = history(&root, &scope).unwrap().to_string();
        assert!(!result.contains("PRIVATE-MARKER"));
        assert!(result.contains("unreadable"));
        std::fs::remove_file(&file).unwrap();
        let fifo = CString::new(file.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        assert!(
            history(&root, &scope)
                .unwrap()
                .to_string()
                .contains("unreadable")
        );
        std::fs::remove_dir_all(root).unwrap();
    }
}
