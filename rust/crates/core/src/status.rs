use crate::{FileChange, GitPath, Repository, Snapshot, args};
use anyhow::{Result, bail};

impl Repository {
    pub(crate) async fn snapshot(&self) -> Result<Snapshot> {
        let output = self
            .run(&args(&[
                "status",
                "--porcelain=v1",
                "-z",
                "--untracked-files=all",
            ]))
            .await?;
        if output.code != 0 {
            bail!("{}", output.text().stderr);
        }
        let mut files = parse_status(&output.stdout)?;
        for file in &mut files {
            let value = match &file.path {
                GitPath::Text(text) => std::ffi::OsString::from(text),
                GitPath::Bytes { bytes } => crate::os_from_bytes(bytes)?,
            };
            if let Ok(metadata) = std::fs::symlink_metadata(self.path.join(value)) {
                file.size = Some(metadata.len());
                file.modified_ns = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_nanos());
            }
        }
        let branch = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        let head = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
        let branch = (branch.code == 0).then(|| {
            let reference = branch.text().stdout;
            let reference = reference.trim_end_matches('\n');
            reference
                .strip_prefix("refs/heads/")
                .unwrap_or(reference)
                .to_owned()
        });
        let head = (head.code == 0).then(|| head.text().stdout.trim().to_owned());
        let (upstream, ahead, behind) = self.tracking(head.as_deref()).await?;
        let policy = self.branch_policy().await?;
        let branch_policy = branch
            .as_deref()
            .and_then(|name| policy.branch(name))
            .cloned();
        Ok(Snapshot {
            branch_policy,
            default_branch: policy.default_branch,
            repository_context: policy.repository_context,
            repository_account: self.account_state().await?.view,
            root_id: self.id(),
            root: self.path.display().to_string(),
            branch,
            head,
            files,
            upstream,
            ahead,
            behind,
            operation: self.operation_state().await?,
        })
    }
}

fn parse_status(bytes: &[u8]) -> Result<Vec<FileChange>> {
    let mut records = bytes.split(|b| *b == 0).peekable();
    let mut files = Vec::new();
    while let Some(record) = records.next() {
        if record.is_empty() {
            continue;
        }
        if record.len() < 4 || record[2] != b' ' {
            bail!("invalid porcelain status record");
        }
        let x = record[0] as char;
        let y = record[1] as char;
        let path = &record[3..];
        let original_path = if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            let original = records
                .next()
                .filter(|p| !p.is_empty())
                .ok_or_else(|| anyhow::anyhow!("missing rename source"))?;
            Some(GitPath::Bytes {
                bytes: original.to_vec(),
            })
        } else {
            None
        };
        files.push(FileChange {
            display_path: String::from_utf8_lossy(path).into_owned(),
            path: GitPath::Bytes {
                bytes: path.to_vec(),
            },
            original_path,
            index: x,
            worktree: y,
            size: None,
            modified_ns: None,
            conflicted: matches!(
                (x, y),
                ('D', 'D')
                    | ('A', 'U')
                    | ('U', 'D')
                    | ('U', 'A')
                    | ('D', 'U')
                    | ('A', 'A')
                    | ('U', 'U')
            ),
        });
    }
    Ok(files)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn handles_unusual_paths_and_renames() {
        let files = parse_status(b"R  new\nname\0old name\0?? invalid\xff\0UU conflict\0").unwrap();
        assert_eq!(files.len(), 3);
        assert_eq!(files[0].display_path, "new\nname");
        assert!(files[0].original_path.is_some());
        assert!(matches!(&files[1].path, GitPath::Bytes{bytes} if bytes == b"invalid\xff"));
        assert!(files[2].conflicted);
    }
    #[test]
    fn rejects_truncated_rename() {
        assert!(parse_status(b"R  new\0").is_err());
    }
}
