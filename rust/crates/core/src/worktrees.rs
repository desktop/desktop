use crate::{GitPath, Repository, args, os_from_bytes};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::Value;
use std::path::PathBuf;

#[derive(Serialize)]
pub(crate) struct Worktree {
    pub path: GitPath,
    pub display_path: String,
    pub head: String,
    pub branch: Option<String>,
    pub detached: bool,
    pub locked: Option<String>,
    pub prunable: Option<String>,
    pub main: bool,
    pub bare: bool,
}
impl Repository {
    pub(crate) async fn worktrees(&self) -> Result<Value> {
        Ok(serde_json::to_value(self.worktree_records().await?)?)
    }
    async fn worktree_records(&self) -> Result<Vec<Worktree>> {
        let output = self
            .run(&args(&["worktree", "list", "--porcelain", "-z"]))
            .await?;
        if output.code != 0 {
            bail!("{}", output.text().stderr);
        }
        parse_worktrees(&output.stdout)
    }
    fn absolute_worktree_path(&self, path: GitPath) -> Result<PathBuf> {
        let value = match path {
            GitPath::Text(text) => text.into(),
            GitPath::Bytes { bytes } => os_from_bytes(&bytes)?,
        };
        if value.is_empty() || value.as_encoded_bytes().contains(&0) {
            bail!("worktree path is empty or contains NUL");
        }
        let path = PathBuf::from(value);
        Ok(if path.is_absolute() {
            path
        } else {
            self.path.join(path)
        })
    }
    async fn known_worktree(&self, path: GitPath) -> Result<PathBuf> {
        let path = self.absolute_worktree_path(path)?;
        let canonical = path.canonicalize().unwrap_or(path.clone());
        for entry in self.worktree_records().await? {
            let candidate = self.absolute_worktree_path(entry.path)?;
            if candidate.canonicalize().unwrap_or(candidate.clone()) == canonical {
                return Ok(candidate);
            }
        }
        bail!("path is not a registered working tree")
    }
    pub(crate) async fn worktree_add(
        &self,
        path: GitPath,
        branch: String,
        new_branch: bool,
        start: Option<String>,
    ) -> Result<Value> {
        self.validate_branch(&branch).await?;
        anyhow::ensure!(
            new_branch || start.is_none(),
            "start is only valid when creating a new branch"
        );
        let _lock = self.stash_lock().await?;
        let creates_branch = if new_branch {
            true
        } else {
            // Native worktree add can create a tracking branch through DWIM
            // even without -b. Reusing an existing local ref stays offline.
            let existing = self
                .run(&args(&[
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &if branch.starts_with("refs/heads/") {
                        branch.clone()
                    } else {
                        format!("refs/heads/{branch}")
                    },
                ]))
                .await?;
            anyhow::ensure!(
                matches!(existing.code, 0 | 1),
                "Cannot inspect worktree branch"
            );
            existing.code == 1
        };
        let name_rules = if creates_branch {
            let policy = self.branch_name_rules(&branch).await?;
            policy.ensure_allowed()?;
            Some(policy)
        } else {
            None
        };
        let path = self.absolute_worktree_path(path)?;
        let mut command = args(&["worktree", "add"]);
        if new_branch {
            command.extend(args(&["-b", &branch]));
        }
        command.push("--".into());
        command.push(path.into_os_string());
        command.push(if new_branch {
            self.resolve_commit(start.as_deref().unwrap_or("HEAD"))
                .await?
                .into()
        } else {
            branch.into()
        });
        let mut result = serde_json::to_value(self.run(&command).await?.text())?;
        if let Some(policy) = name_rules {
            result["name_rules"] = serde_json::to_value(policy)?;
        }
        Ok(result)
    }
    pub(crate) async fn worktree_remove(&self, path: GitPath, force: bool) -> Result<Value> {
        let path = self.known_worktree(path).await?;
        if path.canonicalize().unwrap_or(path.clone()) == self.path {
            bail!("open a different working tree before removing this one");
        }
        let mut command = args(&["worktree", "remove"]);
        if force {
            command.push("--force".into());
        }
        command.push("--".into());
        command.push(path.into_os_string());
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }
    pub(crate) async fn worktree_move(&self, from: GitPath, to: GitPath) -> Result<Value> {
        let from = self.known_worktree(from).await?;
        if from.canonicalize().unwrap_or(from.clone()) == self.path {
            bail!("open a different working tree before moving this one");
        }
        let to = self.absolute_worktree_path(to)?;
        let mut command = args(&["worktree", "move", "--"]);
        command.extend([from.into_os_string(), to.into_os_string()]);
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }
    pub(crate) async fn worktree_lock(
        &self,
        path: GitPath,
        locked: bool,
        reason: Option<String>,
    ) -> Result<Value> {
        let path = self.known_worktree(path).await?;
        let mut command = args(&["worktree", if locked { "lock" } else { "unlock" }]);
        if let Some(reason) = reason {
            if reason.len() > 1024 || reason.contains('\0') {
                bail!("invalid lock reason");
            }
            if locked {
                command.extend(args(&["--reason", &reason]));
            }
        }
        command.push("--".into());
        command.push(path.into_os_string());
        Ok(serde_json::to_value(self.run(&command).await?.text())?)
    }
}
fn parse_worktrees(bytes: &[u8]) -> Result<Vec<Worktree>> {
    let mut records = Vec::new();
    let mut current = None::<Worktree>;
    for field in bytes.split(|b| *b == 0) {
        if field.is_empty() {
            if let Some(entry) = current.take() {
                records.push(entry);
            }
            continue;
        }
        if let Some(path) = field.strip_prefix(b"worktree ") {
            if current.is_some() {
                bail!("unterminated worktree record");
            }
            current = Some(Worktree {
                path: GitPath::Bytes {
                    bytes: path.to_vec(),
                },
                display_path: String::from_utf8_lossy(path).into_owned(),
                head: String::new(),
                branch: None,
                detached: false,
                locked: None,
                prunable: None,
                main: records.is_empty(),
                bare: false,
            });
            continue;
        }
        let record = current.as_mut().context("worktree field before path")?;
        if let Some(head) = field.strip_prefix(b"HEAD ") {
            record.head = std::str::from_utf8(head)?.into();
        } else if let Some(branch) = field.strip_prefix(b"branch ") {
            record.branch = Some(String::from_utf8_lossy(branch).into_owned());
        } else if field == b"detached" {
            record.detached = true;
        } else if field == b"bare" {
            record.bare = true;
        } else if field.starts_with(b"locked") {
            record.locked =
                Some(String::from_utf8_lossy(field.get(7..).unwrap_or_default()).into_owned());
        } else if field.starts_with(b"prunable") {
            record.prunable =
                Some(String::from_utf8_lossy(field.get(9..).unwrap_or_default()).into_owned());
        }
    }
    if let Some(entry) = current {
        records.push(entry);
    }
    Ok(records)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn parses_newline_paths_and_lock_reasons() {
        let entries=parse_worktrees(b"worktree /repo\0HEAD abc\0branch refs/heads/main\0\0worktree /line\nbreak\0HEAD def\0detached\0locked reason\ntext\0\0").unwrap();
        assert_eq!(entries.len(), 2);
        assert!(entries[0].main);
        assert_eq!(entries[1].display_path, "/line\nbreak");
        assert_eq!(entries[1].locked.as_deref(), Some("reason\ntext"));
    }
}
