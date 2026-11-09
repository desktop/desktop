//! Branch tracking and in-progress Git operations, including linked worktrees.
use crate::{Repository, args, os_from_bytes};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::{Value, json};
use std::{fs, path::PathBuf};

#[derive(Debug, Serialize)]
pub struct OperationState {
    pub kind: String,
    pub step: Option<u64>,
    pub total: Option<u64>,
}
impl Repository {
    pub(crate) async fn git_directory(&self) -> Result<PathBuf> {
        let out = self
            .run(&args(&["rev-parse", "--absolute-git-dir"]))
            .await?;
        if out.code != 0 {
            bail!("{}", out.text().stderr);
        }
        Ok(PathBuf::from(os_from_bytes(
            out.stdout.strip_suffix(b"\n").unwrap_or(&out.stdout),
        )?))
    }
    pub(crate) async fn operation_state(&self) -> Result<Option<OperationState>> {
        let directory = self.git_directory().await?;
        for (marker, kind) in [
            ("rebase-merge", "rebase"),
            ("rebase-apply", "rebase"),
            ("MERGE_HEAD", "merge"),
            ("CHERRY_PICK_HEAD", "cherry_pick"),
            ("REVERT_HEAD", "revert"),
        ] {
            if directory.join(marker).exists() {
                let kind = if marker == "rebase-apply"
                    && directory.join(marker).join("applying").exists()
                {
                    "am"
                } else {
                    kind
                };
                let read_number = |name: &str| {
                    fs::read_to_string(directory.join(marker).join(name))
                        .ok()
                        .and_then(|s| s.trim().parse().ok())
                };
                return Ok(Some(OperationState {
                    kind: kind.into(),
                    step: read_number("msgnum").or_else(|| read_number("next")),
                    total: read_number("end").or_else(|| read_number("last")),
                }));
            }
        }
        if let Ok(todo) = fs::read_to_string(directory.join("sequencer/todo")) {
            let kind = if todo.lines().any(|line| line.starts_with("revert ")) {
                "revert"
            } else {
                "cherry_pick"
            };
            return Ok(Some(OperationState {
                kind: kind.into(),
                step: None,
                total: None,
            }));
        }
        Ok(None)
    }
    pub(crate) async fn tracking(
        &self,
        head: Option<&str>,
    ) -> Result<(Option<String>, Option<u64>, Option<u64>)> {
        let Some(head) = head else {
            return Ok((None, None, None));
        };
        let up = self
            .run(&args(&["rev-parse", "--symbolic-full-name", "@{upstream}"]))
            .await?;
        if up.code != 0 {
            return Ok((None, None, None));
        }
        let name = String::from_utf8(up.stdout)?.trim().to_owned();
        let tip = match self.resolve_commit(&name).await {
            Ok(tip) => tip,
            Err(_) => return Ok((Some(name), None, None)),
        };
        let counts = self
            .run(&args(&[
                "rev-list",
                "--left-right",
                "--count",
                &format!("{head}...{tip}"),
                "--",
            ]))
            .await?;
        if counts.code != 0 {
            bail!("{}", counts.text().stderr);
        }
        let text = std::str::from_utf8(&counts.stdout)?;
        let mut fields = text.split_whitespace();
        Ok((
            Some(name),
            Some(fields.next().context("missing ahead count")?.parse()?),
            Some(fields.next().context("missing behind count")?.parse()?),
        ))
    }
    pub(crate) async fn branch_list(&self) -> Result<Value> {
        let output = self
            .run(&args(&[
                "for-each-ref",
                "--sort=refname",
                "--format=%(refname)%00%(objectname)%00%(HEAD)%00%(upstream)%00%(worktreepath)%00%(symref)%00",
                "refs/heads",
                "refs/remotes",
            ]))
            .await?;
        if output.code != 0 {
            bail!("{}", output.text().stderr);
        }
        let mut fields = output.stdout.split(|b| *b == 0);
        let mut branches = Vec::new();
        while let Some(raw_ref) = fields.next() {
            let raw_ref = raw_ref.strip_prefix(b"\n").unwrap_or(raw_ref);
            if raw_ref.is_empty() {
                break;
            }
            let reference = String::from_utf8_lossy(raw_ref).into_owned();
            let oid =
                String::from_utf8_lossy(fields.next().context("missing branch oid")?).into_owned();
            let current = fields.next().context("missing current flag")? == b"*";
            let upstream = fields.next().context("missing upstream ref")?;
            let worktree = fields.next().context("missing worktree path")?;
            let symbolic = fields.next().context("missing symbolic branch target")?;
            // Match Desktop's branch enumeration: aliases such as remote HEAD
            // and symbolic local refs are not independent branch candidates.
            if !symbolic.is_empty() {
                continue;
            }
            let local = reference.starts_with("refs/heads/");
            let name = reference
                .strip_prefix(if local {
                    "refs/heads/"
                } else {
                    "refs/remotes/"
                })
                .unwrap_or(&reference);
            branches.push(json!({"name":name,"ref":reference,"oid":oid,"current":current,"local":local,"upstream":(!upstream.is_empty()).then(||String::from_utf8_lossy(upstream).into_owned()),"worktree":(!worktree.is_empty()).then(||String::from_utf8_lossy(worktree).into_owned())}));
        }
        Ok(Value::Array(branches))
    }
}
