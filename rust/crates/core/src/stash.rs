//! Structured, branch-associated stashes and reviewed native Git mutations.
mod branch_guard;
pub(crate) mod checkout;
pub(crate) mod remote_deletion;
mod rename;
use crate::{Repository, args, cancellation, process};
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const MARKER: &str = "!!GitHub_Desktop<";
#[derive(Clone, Serialize)]
struct Entry {
    index: u32,
    name: String,
    oid: String,
    tree: String,
    parents: Vec<String>,
    message: String,
    timestamp: i64,
    branch: Option<String>,
}
#[derive(Serialize)]
struct Listing {
    basis: String,
    entries: Vec<Entry>,
    has_more: bool,
}
fn branch(message: &str) -> Option<String> {
    let start = message.find(MARKER)? + MARKER.len();
    let value = message.get(start..)?.strip_suffix('>')?;
    (!value.is_empty()).then(|| value.to_owned())
}
fn message(branch: &str) -> String {
    format!("{MARKER}{branch}>")
}
fn oid(value: &str) -> Result<()> {
    anyhow::ensure!(
        matches!(value.len(), 40 | 64) && value.bytes().all(|b| b.is_ascii_hexdigit()),
        "stash ID must be a complete Git object ID"
    );
    Ok(())
}
fn ensure(output: &process::RawOutput) -> Result<()> {
    anyhow::ensure!(
        output.code == 0,
        "Git stash failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
impl Repository {
    // Recovery creates a direct, absent ref. `git branch` can follow an existing
    // dangling symbolic destination and silently create a different branch.
    async fn restore_branch_ref(&self, name: &str, oid: &str) -> Result<process::RawOutput> {
        self.validate_branch(name).await?;
        let reference = format!("refs/heads/{name}");
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", &reference]))
            .await?;
        anyhow::ensure!(
            symbolic.code == 1,
            "Restore destination is symbolic or cannot be inspected"
        );
        process::run_checkout(
            &self.path,
            &args(&[
                "update-ref",
                "--no-deref",
                "--create-reflog",
                "-m",
                "Desktop restore retained branch tip",
                &reference,
                oid,
                &"0".repeat(oid.len()),
            ]),
        )
        .await
    }
    pub(crate) async fn stash_lock(&self) -> Result<std::fs::File> {
        let common = self.common_directory().await?;
        cancellation::blocking(move || {
            use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
            use cap_std::{
                ambient_authority,
                fs::{Dir, OpenOptions},
            };
            let directory = Dir::open_ambient_dir(common, ambient_authority())?;
            let mut options = OpenOptions::new();
            options
                .read(true)
                .write(true)
                .create(true)
                .follow(FollowSymlinks::No);
            #[cfg(unix)]
            {
                use cap_std::fs::OpenOptionsExt;
                options.mode(0o600).custom_flags(libc::O_NONBLOCK);
            }
            let lock = directory
                .open_with("desktop-stash.lock", &options)?
                .into_std();
            anyhow::ensure!(
                lock.metadata()?.is_file(),
                "stash lock must be a regular file"
            );
            loop {
                cancellation::Cancellation::current().check()?;
                match lock.try_lock() {
                    Ok(()) => break,
                    Err(std::fs::TryLockError::WouldBlock) => {
                        std::thread::sleep(std::time::Duration::from_millis(10))
                    }
                    Err(std::fs::TryLockError::Error(error)) => {
                        return Err(error).context("lock shared stash operations");
                    }
                }
            }
            Ok(lock)
        })
        .await
    }
    async fn stashes(&self) -> Result<Listing> {
        let reference = process::run_stash(
            &self.path,
            &args(&["rev-parse", "--verify", "--quiet", "refs/stash"]),
        )
        .await?;
        anyhow::ensure!(
            matches!(reference.code, 0 | 1),
            "cannot inspect refs/stash: {}",
            String::from_utf8_lossy(&reference.stderr)
        );
        let raw = if reference.code == 1 {
            Vec::new()
        } else {
            let output = process::run_stash(
                &self.path,
                &args(&[
                    "log",
                    "-g",
                    "--no-show-signature",
                    "--no-decorate",
                    "--max-count=1001",
                    "--format=%H%x00%gs%x00%ct%x00%T%x00%P",
                    "-z",
                    "refs/stash",
                    "--",
                ]),
            )
            .await?;
            ensure(&output)?;
            output.stdout
        };
        let mut hasher = Sha256::new();
        hasher.update(self.id());
        hasher.update(&raw);
        let basis = format!("{:x}", hasher.finalize());
        let mut fields: Vec<_> = raw.split(|b| *b == 0).collect();
        if fields.last() == Some(&b"".as_slice()) {
            fields.pop();
        }
        anyhow::ensure!(
            fields.len().is_multiple_of(5),
            "invalid stash reflog framing"
        );
        let mut entries = Vec::new();
        for (index, fields) in fields.as_chunks::<5>().0.iter().enumerate() {
            let id = std::str::from_utf8(fields[0])?.to_owned();
            oid(&id)?;
            let tree = std::str::from_utf8(fields[3])?.to_owned();
            oid(&tree)?;
            let parents = std::str::from_utf8(fields[4])?
                .split_whitespace()
                .map(str::to_owned)
                .collect::<Vec<_>>();
            for parent in &parents {
                oid(parent)?;
            }
            let message = String::from_utf8_lossy(fields[1]).into_owned();
            entries.push(Entry {
                index: index as u32,
                name: format!("stash@{{{index}}}"),
                oid: id,
                tree,
                parents,
                branch: branch(&message),
                message,
                timestamp: std::str::from_utf8(fields[2])?.parse()?,
            });
        }
        let has_more = entries.len() > 1000;
        entries.truncate(1000);
        Ok(Listing {
            basis,
            entries,
            has_more,
        })
    }
    pub(crate) async fn stash_list(&self) -> Result<Value> {
        Ok(serde_json::to_value(self.stashes().await?)?)
    }
    async fn checked_stash(
        &self,
        id: &str,
        index: Option<u32>,
        basis: Option<&str>,
    ) -> Result<(Listing, Entry)> {
        oid(id)?;
        let listing = self.stashes().await?;
        anyhow::ensure!(
            basis.is_none_or(|basis| basis == listing.basis),
            "Stashes changed; refresh the stash list before continuing"
        );
        let entry = listing
            .entries
            .iter()
            .find(|entry| entry.oid == id && index.is_none_or(|index| index == entry.index))
            .context("Selected stash is no longer in this stash list")?
            .clone();
        anyhow::ensure!(
            matches!(entry.parents.len(), 2 | 3),
            "selected entry is not a supported stash commit"
        );
        Ok((listing, entry))
    }
    pub(crate) async fn stash_save(
        &self,
        text: String,
        include_untracked: bool,
        desktop: bool,
    ) -> Result<Value> {
        anyhow::ensure!(
            text.len() <= 4096 && !text.contains('\0'),
            "stash message must be at most 4096 bytes without NUL"
        );
        let _lock = self.stash_lock().await?;
        self.stash_save_locked(text, include_untracked, desktop)
            .await
    }
    async fn stash_save_locked(
        &self,
        text: String,
        include_untracked: bool,
        desktop: bool,
    ) -> Result<Value> {
        let before = self.stashes().await?;
        let text = if desktop {
            anyhow::ensure!(
                text.is_empty(),
                "branch-associated stashes use their generated branch message"
            );
            let current = self
                .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
                .await?;
            anyhow::ensure!(
                current.code == 0,
                "Branch-associated stashes require a local branch; use a named stash while detached"
            );
            let reference = std::str::from_utf8(&current.stdout)?.trim_end_matches('\n');
            message(
                reference
                    .strip_prefix("refs/heads/")
                    .context("stash association requires a local branch")?,
            )
        } else {
            text
        };
        let mut command = args(&["stash", "push"]);
        if include_untracked {
            command.push("--include-untracked".into());
        }
        if !text.is_empty() {
            command.extend(args(&["--message", &text]));
        }
        let output = process::run_stash(&self.path, &command).await?;
        let after = self.stashes().await?;
        let created = after
            .entries
            .first()
            .filter(|_| before.basis != after.basis);
        let mut value = serde_json::to_value(output.text())?;
        value["created"] = json!(created.is_some());
        value["oid"] = json!(created.map(|entry| &entry.oid));
        Ok(value)
    }
    pub(crate) async fn stash_files(&self, id: &str) -> Result<Value> {
        let (_, entry) = self.checked_stash(id, None, None).await?;
        let mut tracked = self.commit_files(&entry.oid, 0).await?;
        let mut files = tracked["files"]
            .as_array_mut()
            .context("invalid stash file list")?
            .clone();
        for file in &mut files {
            file["commit"] = json!(entry.oid);
            file["untracked"] = json!(false);
        }
        if let Some(untracked) = entry.parents.get(2) {
            let captured = self.commit_files(untracked, 0).await?;
            for mut file in captured["files"]
                .as_array()
                .context("invalid untracked file list")?
                .clone()
            {
                file["commit"] = json!(untracked);
                file["untracked"] = json!(true);
                files.push(file);
            }
        }
        let mut staged = self.commit_files(&entry.parents[1], 0).await?;
        for file in staged["files"]
            .as_array_mut()
            .context("invalid staged stash files")?
        {
            file["commit"] = json!(entry.parents[1]);
            file["untracked"] = json!(false);
        }
        Ok(
            json!({"oid":entry.oid,"files":files,"staged_files":staged["files"],"base":entry.parents[0],"index_commit":entry.parents[1]}),
        )
    }
    pub(crate) async fn stash_drop(&self, id: &str, index: u32, basis: &str) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        self.stash_drop_checked(id, index, basis).await
    }
    async fn stash_drop_checked(&self, id: &str, index: u32, basis: &str) -> Result<Value> {
        let (_, entry) = self.checked_stash(id, Some(index), Some(basis)).await?;
        Ok(serde_json::to_value(
            process::run_stash(
                &self.path,
                &args(&["stash", "drop", "--quiet", &entry.name]),
            )
            .await?
            .text(),
        )?)
    }
    pub(crate) async fn stash_apply(
        &self,
        id: &str,
        index: Option<u32>,
        basis: Option<&str>,
        restore_index: bool,
        pop: bool,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        self.stash_apply_locked(id, index, basis, restore_index, pop)
            .await
    }
    async fn stash_apply_locked(
        &self,
        id: &str,
        index: Option<u32>,
        basis: Option<&str>,
        restore_index: bool,
        pop: bool,
    ) -> Result<Value> {
        let (listing, entry) = self.checked_stash(id, index, basis).await?;
        let mut command = args(&["stash", "apply"]);
        if restore_index {
            command.push("--index".into());
        }
        command.push(entry.oid.clone().into());
        let output = process::run_stash(&self.path, &command).await?;
        let success = output.code == 0;
        let mut result = serde_json::to_value(output.text())?;
        result["oid"] = json!(entry.oid);
        result["retained"] = json!(true);
        if success && pop {
            let current = self.stashes().await?;
            if current.basis == listing.basis {
                let dropped = self
                    .stash_drop_checked(&entry.oid, entry.index, &current.basis)
                    .await;
                let dropped = dropped.unwrap_or_else(|_| json!({"code":1}));
                if dropped["code"] == 0 {
                    result["retained"] = json!(false);
                } else {
                    result["warning"] =
                        json!("Changes applied; the stash could not be dropped and is retained");
                }
            } else {
                result["warning"] = json!(
                    "Changes applied; the stash list changed, so the saved stash is retained"
                );
            }
        }
        Ok(result)
    }
    pub(crate) async fn stash_move(
        &self,
        id: &str,
        index: u32,
        basis: &str,
        branch: &str,
    ) -> Result<Value> {
        self.validate_branch(branch).await?;
        let _lock = self.stash_lock().await?;
        let (before, entry) = self.checked_stash(id, Some(index), Some(basis)).await?;
        if entry.branch.as_deref() == Some(branch) {
            return Ok(
                json!({"code":0,"stdout":"","stderr":"","oid":entry.oid,"original_retained":false,"unchanged":true}),
            );
        }
        let message = format!("On {branch}: {}", message(branch));
        let new_id = self.copy_stash(&entry, &message).await?;
        // Store the replacement before removing the original; failure/cancellation
        // must leave at least the original entry reachable.
        let stored = process::run_stash(
            &self.path,
            &args(&["stash", "store", "-m", &message, &new_id]),
        )
        .await?;
        ensure(&stored)?;
        let current = self.stashes().await?;
        let mut retained = true;
        // A native store should prepend exactly one entry. If another writer
        // changed the reflog, keep both instead of guessing a new position.
        if current
            .entries
            .first()
            .is_some_and(|entry| entry.oid == new_id)
            && current.entries.len() == before.entries.len() + 1
            && current.entries[1..]
                .iter()
                .zip(&before.entries)
                .all(|(a, b)| a.oid == b.oid && a.message == b.message)
        {
            let dropped = self
                .stash_drop_checked(&entry.oid, index + 1, &current.basis)
                .await;
            retained = !dropped.is_ok_and(|value| value["code"] == 0);
        }
        Ok(json!({"code":0,"stdout":"","stderr":"","oid":new_id,"original_retained":retained}))
    }
    async fn copy_stash(&self, entry: &Entry, message: &str) -> Result<String> {
        let mut command = args(&["commit-tree", "--no-gpg-sign", "-m", message]);
        for parent in &entry.parents {
            command.extend(args(&["-p", parent]));
        }
        command.push(entry.tree.clone().into());
        let created = process::run_stash(&self.path, &command).await?;
        ensure(&created)?;
        let id = std::str::from_utf8(&created.stdout)?.trim();
        oid(id)?;
        Ok(id.to_owned())
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn desktop_messages_match_existing_desktop_markers() {
        assert_eq!(
            branch("On main: !!GitHub_Desktop<feature/one>"),
            Some("feature/one".into())
        );
        assert_eq!(
            branch(&message("branch<with>angles")),
            Some("branch<with>angles".into())
        );
        for invalid in [
            "ordinary stash",
            "!!GitHub_Desktop<>",
            "!!GitHub_Desktop<main> suffix",
        ] {
            assert!(branch(invalid).is_none());
        }
    }
}
