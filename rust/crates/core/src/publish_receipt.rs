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
impl Repository {
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
        let scope = Scope {
            repository_id: self.id(),
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
            registry.with_record_lock(&scope.record_id, &path, || history(&root, &scope))
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
