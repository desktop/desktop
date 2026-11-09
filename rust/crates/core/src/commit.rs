//! Review staged Git blob sizes before invoking Git's normal commit workflow.
use crate::{GitPath, Repository, args, cancellation, diff::read_index, process, validate_path};
use anyhow::{Context, Result, bail};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    path::PathBuf,
};

const LARGE_BLOB_LIMIT: u64 = 100 * 1024 * 1024;
#[derive(Serialize)]
struct LargeFile {
    path: GitPath,
    display_path: String,
    oid: String,
    size: u64,
    tracked_by_lfs: bool,
}
#[derive(Serialize)]
struct CommitPreview {
    basis: String,
    threshold_bytes: u64,
    staged_count: usize,
    large_files: Vec<LargeFile>,
}
struct Candidate {
    path: Vec<u8>,
    oid: String,
}

impl Repository {
    pub(crate) async fn commit_preview(&self) -> Result<Value> {
        Ok(serde_json::to_value(self.capture_commit_preview().await?)?)
    }

    pub(crate) async fn reviewed_commit(
        &self,
        summary: String,
        description: String,
        allow_large_files: bool,
        basis: Option<String>,
    ) -> Result<Value> {
        anyhow::ensure!(
            !summary.trim().is_empty() && !summary.contains(['\n', '\r', '\0']),
            "commit summary must be a nonempty single line"
        );
        anyhow::ensure!(
            !description.contains('\0'),
            "commit description contains NUL"
        );
        anyhow::ensure!(
            !allow_large_files || basis.is_some(),
            "review commit-preview and supply its basis before allowing large files"
        );
        let preview = self.capture_commit_preview().await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                basis == preview.basis,
                "Staged files, HEAD, branch, or LFS attributes changed; review the commit again"
            );
        }
        if !preview.large_files.is_empty() && !allow_large_files {
            return Ok(
                json!({"code":2,"stdout":"","stderr":"Staged Git blobs exceed 100 MiB. Use Git LFS or unstage them, or review commit-preview and explicitly allow large files with its basis.","requires_confirmation":true,"preview":preview}),
            );
        }
        // The certificate is checked immediately before invocation. Git owns
        // index/ref locking and hook/signing semantics; hooks can change the
        // index just as they can in an ordinary terminal commit.
        let mut command = args(&["commit", "-m", &summary]);
        if !description.is_empty() {
            command.extend(args(&["-m", &description]));
        }
        Ok(serde_json::to_value(
            process::run_commit(&self.path, &command).await?.text(),
        )?)
    }

    async fn commit_head_identity(&self) -> Result<(Option<String>, Option<String>)> {
        let head = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
        let head = if head.code == 0 {
            Some(String::from_utf8(head.stdout)?.trim().to_owned())
        } else {
            // A quiet lookup distinguishes a genuinely unborn HEAD from a broken
            // repository while retaining Git's native diagnostic on failure.
            let missing = self
                .run(&args(&["rev-parse", "--verify", "--quiet", "HEAD"]))
                .await?;
            anyhow::ensure!(missing.code == 1, "cannot resolve HEAD for commit review");
            None
        };
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        anyhow::ensure!(
            matches!(symbolic.code, 0 | 1),
            "cannot inspect the current branch"
        );
        Ok((
            head,
            if symbolic.code == 0 {
                Some(String::from_utf8(symbolic.stdout)?.trim().to_owned())
            } else {
                None
            },
        ))
    }

    async fn capture_commit_preview(&self) -> Result<CommitPreview> {
        let index_path = self.index_path().await?;
        let index = index_identity(index_path.clone()).await?;
        let head = self.commit_head_identity().await?;
        let git_directory = self.git_directory().await?;
        let operation = cancellation::blocking({
            let path = git_directory.clone();
            move || crate::discard::operation_certificate(&path)
        })
        .await?;
        // Replacement refs must not hide the size of the real blobs that will
        // be recorded in a tree and sent to a remote. Disable rename detection
        // so every new/changed destination has one unambiguous raw record.
        let raw = checked(
            self.run(&args(&[
                "--no-replace-objects",
                "diff",
                "--cached",
                "--raw",
                "--no-abbrev",
                "--no-renames",
                "--ita-invisible-in-index",
                "--no-ext-diff",
                "--no-textconv",
                "-z",
                "--",
            ]))
            .await?,
        )?;
        let (staged_count, candidates) = candidates(&raw.stdout)?;
        let unique: BTreeSet<_> = candidates.iter().map(|entry| entry.oid.as_str()).collect();
        let mut sizes = BTreeMap::new();
        if !unique.is_empty() {
            let input = unique
                .iter()
                .map(|oid| format!("{oid}\n"))
                .collect::<String>()
                .into_bytes();
            let output = checked(
                process::run_git(
                    &self.path,
                    &args(&[
                        "--no-replace-objects",
                        "cat-file",
                        "--batch-check=%(objectname) %(objecttype) %(objectsize)",
                    ]),
                    Some(input),
                    None,
                )
                .await?,
            )?;
            for line in std::str::from_utf8(&output.stdout)?.lines() {
                let fields: Vec<_> = line.split_ascii_whitespace().collect();
                anyhow::ensure!(
                    fields.len() == 3 && fields[1] == "blob" && unique.contains(fields[0]),
                    "missing or invalid staged Git blob"
                );
                let size = fields[2].parse::<u64>()?;
                anyhow::ensure!(
                    sizes.insert(fields[0].to_owned(), size).is_none(),
                    "duplicate staged blob metadata"
                );
            }
            anyhow::ensure!(
                sizes.len() == unique.len(),
                "incomplete staged blob metadata"
            );
        }
        let mut large_files = Vec::new();
        for entry in candidates {
            let size = *sizes.get(&entry.oid).context("missing staged blob size")?;
            if size > LARGE_BLOB_LIMIT {
                anyhow::ensure!(
                    large_files.len() < 1000,
                    "more than 1000 oversized paths are staged; split the commit before review"
                );
                large_files.push(LargeFile {
                    display_path: String::from_utf8_lossy(&entry.path).into_owned(),
                    path: GitPath::Bytes { bytes: entry.path },
                    oid: entry.oid,
                    size,
                    tracked_by_lfs: false,
                });
            }
        }
        if !large_files.is_empty() {
            let mut command = args(&["check-attr", "-z", "filter", "--"]);
            for file in &large_files {
                command.push(validate_path(file.path.clone())?);
            }
            let attributes = checked(self.run(&command).await?)?;
            let fields: Vec<_> = attributes.stdout.split(|byte| *byte == 0).collect();
            anyhow::ensure!(
                fields.len() == large_files.len() * 3 + 1 && fields.last() == Some(&b"".as_slice()),
                "invalid LFS attribute response during commit review"
            );
            for (file, fields) in large_files.iter_mut().zip(fields.as_chunks::<3>().0) {
                anyhow::ensure!(fields[1] == b"filter", "unexpected commit attribute");
                file.tracked_by_lfs = fields[2] == b"lfs";
            }
        }
        anyhow::ensure!(
            index_identity(index_path).await? == index
                && self.commit_head_identity().await? == head,
            "Index or HEAD changed while loading commit review; retry"
        );
        anyhow::ensure!(
            cancellation::blocking(move || crate::discard::operation_certificate(&git_directory))
                .await?
                == operation,
            "Repository operation changed during commit review; retry"
        );
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                self.id(),
                index,
                head,
                LARGE_BLOB_LIMIT,
                staged_count,
                &operation,
                &large_files
            ))?)
        );
        Ok(CommitPreview {
            basis,
            threshold_bytes: LARGE_BLOB_LIMIT,
            staged_count,
            large_files,
        })
    }
}

async fn index_identity(path: PathBuf) -> Result<Option<String>> {
    cancellation::blocking(move || {
        let Some(bytes) = read_index(&path)? else {
            return Ok(None);
        };
        let mut digest = Sha256::new();
        for chunk in bytes.chunks(64 * 1024) {
            cancellation::Cancellation::current().check()?;
            digest.update(chunk);
        }
        Ok(Some(format!("{:x}", digest.finalize())))
    })
    .await
}
fn checked(output: process::RawOutput) -> Result<process::RawOutput> {
    if output.code != 0 {
        bail!("{}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(output)
}
fn candidates(bytes: &[u8]) -> Result<(usize, Vec<Candidate>)> {
    let mut fields = bytes
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty());
    let mut count = 0;
    let mut files = Vec::new();
    while let Some(header) = fields.next() {
        let header = std::str::from_utf8(header)?
            .strip_prefix(':')
            .context("invalid staged raw record")?;
        let metadata: Vec<_> = header.split_ascii_whitespace().collect();
        anyhow::ensure!(metadata.len() == 5, "invalid staged raw fields");
        let first = fields.next().context("missing staged path")?;
        let path = if metadata[4].starts_with(['R', 'C']) {
            fields.next().context("missing staged rename path")?
        } else {
            first
        };
        count += 1;
        if matches!(metadata[1], "100644" | "100755")
            && !metadata[3].bytes().all(|byte| byte == b'0')
        {
            anyhow::ensure!(
                matches!(metadata[3].len(), 40 | 64)
                    && metadata[3].bytes().all(|byte| byte.is_ascii_hexdigit()),
                "invalid staged object ID"
            );
            validate_path(GitPath::Bytes {
                bytes: path.to_vec(),
            })?;
            files.push(Candidate {
                path: path.to_vec(),
                oid: metadata[3].to_owned(),
            });
        }
    }
    Ok((count, files))
}
