//! Stable, paginated history and byte-preserving committed file lists.
use crate::{GitPath, Repository, args, process};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::{Value, json};

#[derive(Serialize)]
pub(crate) struct Identity {
    pub name: String,
    pub email: String,
    pub timestamp: i64,
    pub timezone: String,
}
#[derive(Serialize)]
pub(crate) struct Commit {
    pub oid: String,
    pub tree: String,
    pub parents: Vec<String>,
    pub author: Identity,
    pub committer: Identity,
    pub summary: String,
    pub message: String,
    pub encoding: Option<String>,
    pub signed: bool,
    pub trailers: Vec<Value>,
}

impl Repository {
    pub(crate) async fn history(
        &self,
        revision: Option<String>,
        offset: usize,
        limit: u16,
    ) -> Result<Value> {
        if !(1..=100).contains(&limit) || offset > 1_000_000 {
            bail!("history limit must be 1..100 and offset at most 1000000");
        }
        let revision = match revision {
            Some(revision) => self.resolve_commit(&revision).await?,
            None => {
                let output = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
                if output.code != 0 {
                    return Ok(json!({"revision":null,"commits":[],"next_offset":null}));
                }
                String::from_utf8(output.stdout)?.trim().to_owned()
            }
        };
        let listed = self
            .run(&args(&[
                "rev-list",
                "--topo-order",
                &format!("--max-count={}", limit + 1),
                &format!("--skip={offset}"),
                &revision,
                "--",
            ]))
            .await?;
        ensure(&listed)?;
        let ids: Vec<_> = std::str::from_utf8(&listed.stdout)?.lines().collect();
        let more = ids.len() > limit as usize;
        let chosen = &ids[..ids.len().min(limit as usize)];
        let mut commits = if chosen.is_empty() {
            Vec::new()
        } else {
            let output = process::run_git(
                &self.path,
                &args(&["cat-file", "--batch"]),
                Some(format!("{}\n", chosen.join("\n")).into_bytes()),
                None,
            )
            .await?;
            ensure(&output)?;
            parse_batch(&output.stdout)?
        };
        let separators = self
            .run(&args(&["config", "--get", "trailer.separators"]))
            .await?;
        let separators = if separators.code == 0 {
            String::from_utf8(separators.stdout)?.trim().to_owned()
        } else {
            ":".to_owned()
        };
        for commit in &mut commits {
            let output = process::run_git(
                &self.path,
                &args(&["interpret-trailers", "--parse"]),
                Some(commit.message.as_bytes().to_vec()),
                None,
            )
            .await?;
            ensure(&output)?;
            for line in String::from_utf8_lossy(&output.stdout).lines() {
                if let Some((token, value)) = line.split_once(|c: char| separators.contains(c)) {
                    commit
                        .trailers
                        .push(json!({"token":token.trim(),"value":value.trim()}));
                }
            }
        }
        Ok(
            json!({"revision":revision,"commits":commits,"next_offset":more.then_some(offset+commits.len())}),
        )
    }

    pub(crate) async fn commit_files(&self, revision: &str, parent: usize) -> Result<Value> {
        let commit = self.resolve_commit(revision).await?;
        let base = self.commit_parent(&commit, parent).await?;
        let mut command = args(&[
            "diff-tree",
            "-r",
            "--root",
            "--no-commit-id",
            "--name-status",
            "-z",
            "-M",
        ]);
        if let Some(base) = &base {
            command.push(base.into());
        }
        command.extend(args(&[&commit, "--"]));
        let output = self.run(&command).await?;
        ensure(&output)?;
        Ok(json!({"commit":commit,"parent":base,"files":parse_files(&output.stdout)?}))
    }

    pub(crate) async fn commit_parent(
        &self,
        commit: &str,
        parent: usize,
    ) -> Result<Option<String>> {
        let output = self
            .run(&args(&["rev-list", "--parents", "-n", "1", commit, "--"]))
            .await?;
        ensure(&output)?;
        let fields: Vec<_> = std::str::from_utf8(&output.stdout)?
            .split_whitespace()
            .collect();
        if fields.len() == 1 && parent == 0 {
            return Ok(None);
        }
        Ok(Some(
            fields
                .get(
                    parent
                        .checked_add(1)
                        .context("parent index exceeds usize")?,
                )
                .context("commit has no such parent")?
                .to_string(),
        ))
    }
}

#[derive(Serialize)]
struct ChangedFile {
    status: String,
    path: GitPath,
    display_path: String,
    original_path: Option<GitPath>,
}
fn parse_files(bytes: &[u8]) -> Result<Vec<ChangedFile>> {
    let mut fields = bytes.split(|b| *b == 0).filter(|b| !b.is_empty());
    let mut files = Vec::new();
    while let Some(status) = fields.next() {
        let first = fields.next().context("missing committed file path")?;
        let renamed = matches!(status.first(), Some(b'R' | b'C'));
        let path = if renamed {
            fields.next().context("missing rename destination")?
        } else {
            first
        };
        files.push(ChangedFile {
            status: std::str::from_utf8(status)?.to_owned(),
            path: GitPath::Bytes {
                bytes: path.to_vec(),
            },
            display_path: String::from_utf8_lossy(path).into_owned(),
            original_path: renamed.then(|| GitPath::Bytes {
                bytes: first.to_vec(),
            }),
        });
    }
    Ok(files)
}
/// Reuse the byte-preserving name-status parser for index-only diff lookup.
pub(crate) fn staged_rename_source(
    bytes: &[u8],
    path: &std::ffi::OsStr,
) -> Result<Option<GitPath>> {
    Ok(parse_files(bytes)?
        .into_iter()
        .find(|file| {
            file.status.starts_with('R')
                && crate::validate_path(file.path.clone()).is_ok_and(|candidate| candidate == path)
        })
        .and_then(|file| file.original_path))
}
fn ensure(output: &process::RawOutput) -> Result<()> {
    if output.code != 0 {
        bail!("{}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(())
}
fn parse_batch(mut bytes: &[u8]) -> Result<Vec<Commit>> {
    let mut commits = Vec::new();
    while !bytes.is_empty() {
        let split = bytes
            .iter()
            .position(|b| *b == b'\n')
            .context("missing batch header")?;
        let header = std::str::from_utf8(&bytes[..split])?;
        let fields: Vec<_> = header.split_whitespace().collect();
        if fields.len() != 3 || fields[1] != "commit" {
            bail!("expected a commit in batch response");
        }
        let size: usize = fields[2].parse()?;
        bytes = &bytes[split + 1..];
        if size >= bytes.len() || bytes[size] != b'\n' {
            bail!("truncated commit batch response");
        }
        commits.push(parse_commit(fields[0], &bytes[..size])?);
        bytes = &bytes[size + 1..];
    }
    Ok(commits)
}
fn parse_commit(oid: &str, raw: &[u8]) -> Result<Commit> {
    let boundary = raw
        .windows(2)
        .position(|b| b == b"\n\n")
        .context("commit lacks a message boundary")?;
    let mut tree = None;
    let mut author = None;
    let mut committer = None;
    let mut parents = Vec::new();
    let mut encoding = None;
    let mut signed = false;
    for line in String::from_utf8_lossy(&raw[..boundary]).lines() {
        let Some((key, value)) = line.split_once(' ') else {
            continue;
        };
        match key {
            "tree" => tree = Some(value.to_owned()),
            "parent" => parents.push(value.to_owned()),
            "author" => author = Some(parse_identity(value)?),
            "committer" => committer = Some(parse_identity(value)?),
            "encoding" => encoding = Some(value.to_owned()),
            "gpgsig" | "gpgsig-sha256" => signed = true,
            _ => {}
        }
    }
    let message = String::from_utf8_lossy(&raw[boundary + 2..]).into_owned();
    Ok(Commit {
        oid: oid.to_owned(),
        tree: tree.context("missing commit tree")?,
        parents,
        author: author.context("missing commit author")?,
        committer: committer.context("missing commit committer")?,
        summary: message.lines().next().unwrap_or_default().to_owned(),
        message,
        encoding,
        signed,
        trailers: Vec::new(),
    })
}
fn parse_identity(value: &str) -> Result<Identity> {
    let (who, when) = value.rsplit_once("> ").context("invalid commit identity")?;
    let (name, email) = who.rsplit_once(" <").context("invalid identity email")?;
    let (timestamp, timezone) = when.split_once(' ').context("invalid identity date")?;
    Ok(Identity {
        name: name.to_owned(),
        email: email.to_owned(),
        timestamp: timestamp.parse()?,
        timezone: timezone.to_owned(),
    })
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn length_framing_preserves_delimiters_in_messages() {
        let raw=b"tree abc\nauthor A <a@b> -1 +0200\ncommitter C <c@d> 2 -0500\ngpgsig signature\n continuation\n\nsubject\n\nbody\0with delimiter\n";
        let mut batch = format!("abc commit {}\n", raw.len()).into_bytes();
        batch.extend(raw);
        batch.push(b'\n');
        let parsed = parse_batch(&batch).unwrap();
        assert!(parsed[0].message.contains('\0'));
        assert!(parsed[0].signed);
        assert_eq!(parsed[0].author.timestamp, -1);
        batch.pop();
        assert!(parse_batch(&batch).is_err());
    }
}
