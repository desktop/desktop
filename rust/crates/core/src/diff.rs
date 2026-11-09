//! Captured file diffs and content-based partial index transactions.
use crate::{GitPath, Repository, args, os_from_bytes, process, validate_path};
use anyhow::{Context, Result, bail};
use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    ffi::OsStr,
    fs::{self, File, OpenOptions},
    io::{Read, Write},
    path::{Path, PathBuf},
};

const CONTENT_LIMIT: usize = 1024 * 1024;
const INDEX_LIMIT: u64 = 64 * 1024 * 1024;

#[derive(Clone)]
struct Entry {
    mode: String,
    oid: String,
}

#[derive(Clone, Serialize)]
struct LfsPreview {
    #[serde(flatten)]
    object: crate::lfs::LfsObject,
    state: &'static str,
}
struct Side {
    lfs: Option<LfsPreview>,
    entry: Option<Entry>,
    bytes: Vec<u8>,
    oversized: bool,
    size: u64,
}

#[derive(Serialize)]
struct Preview {
    #[serde(skip_serializing_if = "Option::is_none")]
    lfs: Option<LfsPreview>,
    mode: Option<String>,
    oid: Option<String>,
    size: u64,
    image: Option<Image>,
    text: Option<String>,
}
#[derive(Serialize)]
struct Image {
    mime: &'static str,
    data: String,
}
#[derive(Serialize)]
struct View {
    #[serde(skip)]
    selection_lfs: bool,
    path: GitPath,
    staged: bool,
    kind: &'static str,
    basis: String,
    can_select: bool,
    before: Preview,
    after: Preview,
    hunks: Vec<Hunk>,
}
#[derive(Serialize)]
struct Hunk {
    old_start: usize,
    old_count: usize,
    new_start: usize,
    new_count: usize,
    lines: Vec<Line>,
}
#[derive(Serialize)]
struct Line {
    id: usize,
    kind: &'static str,
    old_line: Option<usize>,
    new_line: Option<usize>,
    text: String,
    no_newline: bool,
    #[serde(skip)]
    bytes: Vec<u8>,
}

impl Side {
    fn preview(&self) -> Preview {
        Preview {
            lfs: self.lfs.clone(),
            mode: self.entry.as_ref().map(|entry| entry.mode.clone()),
            oid: self.entry.as_ref().map(|entry| entry.oid.clone()),
            size: self.size,
            text: self
                .entry
                .as_ref()
                .filter(|entry| entry.mode == "120000")
                .map(|_| String::from_utf8_lossy(&self.bytes).into_owned()),
            image: image_type(&self.bytes).map(|mime| Image {
                mime,
                data: STANDARD.encode(&self.bytes),
            }),
        }
    }
    fn lfs_unavailable(&self) -> bool {
        self.lfs
            .as_ref()
            .is_some_and(|preview| !matches!(preview.state, "available" | "too_large"))
    }
    fn exists(&self) -> bool {
        self.entry.is_some()
    }
    fn regular(&self) -> bool {
        self.entry
            .as_ref()
            .is_none_or(|entry| matches!(entry.mode.as_str(), "100644" | "100755"))
    }
}

impl Repository {
    pub(crate) async fn diff_detail(&self, path: GitPath, staged: bool) -> Result<Value> {
        let path = validate_path(path)?;
        let scratch = Scratch::new(&self.index_path().await?)?;
        let index_before = read_index(&scratch.index_path)?;
        let (view, _, _) = self
            .capture_diff(&path, staged, &index_before, &scratch)
            .await?;
        if read_index(&scratch.index_path)? != index_before {
            bail!("Index changed while loading diff; reload the file");
        }
        Ok(serde_json::to_value(view)?)
    }

    pub(crate) async fn select_diff(
        &self,
        path: GitPath,
        staged: bool,
        basis: &str,
        selected: Vec<usize>,
    ) -> Result<Value> {
        if selected.is_empty() {
            bail!("select at least one changed line");
        }
        let path = validate_path(path)?;
        let index_path = self.index_path().await?;
        let mut transaction = IndexTransaction::begin(&index_path)?;
        let original = read_index(&index_path)?;
        let scratch = Scratch::new(&index_path)?;
        let (view, before, after) = self
            .capture_diff(&path, staged, &original, &scratch)
            .await?;
        if !view.can_select {
            bail!("This diff does not support line selection; use whole-file staging");
        }
        if view.basis != basis {
            bail!("File or index changed; reload the diff and select lines again");
        }
        let selected: HashSet<_> = selected.into_iter().collect();
        let valid: HashSet<_> = view
            .hunks
            .iter()
            .flat_map(|hunk| &hunk.lines)
            .filter(|line| matches!(line.kind, "added" | "deleted"))
            .map(|line| line.id)
            .collect();
        if !selected.is_subset(&valid) {
            bail!("selection contains a context or unknown line");
        }
        let desired = select_content(&before.bytes, &view.hunks, &selected, staged)?;
        let destination_exists = if staged {
            before.exists() || !desired.is_empty()
        } else {
            after.exists() || !desired.is_empty()
        };
        let index_entry = self.index_entry(&path).await?;
        let (mode, oid) = if destination_exists {
            let mode = if staged {
                after.entry.as_ref().or(before.entry.as_ref())
            } else {
                before.entry.as_ref().or(after.entry.as_ref())
            }
            .context("missing file mode")?
            .mode
            .clone();
            (
                mode,
                self.hash_selection(&path, desired, view.selection_lfs)
                    .await?,
            )
        } else {
            (
                "0".to_owned(),
                "0".repeat(
                    index_entry
                        .as_ref()
                        .context("file is no longer indexed")?
                        .oid
                        .len(),
                ),
            )
        };
        // An alternate index preserves every unrelated entry, extension, and file mode.
        if let Some(original) = &original {
            scratch.write_index(original)?;
        }
        let mut instruction = format!("{mode} {oid}\t").into_bytes();
        instruction.extend(path.as_encoded_bytes());
        instruction.push(0);
        let updated = process::run_git(
            &self.path,
            &args(&["update-index", "-z", "--index-info"]),
            Some(instruction),
            Some(&scratch.alternate_index),
        )
        .await?;
        ensure_success(&updated)?;
        let replacement =
            read_index(&scratch.alternate_index)?.context("Git did not produce an index")?;
        transaction.commit(&replacement)?;
        Ok(json!({"code":0,"stdout":"","stderr":""}))
    }

    /// Build the canonical blob after reversing a certified unstaged selection.
    pub(crate) async fn discarded_selection(
        &self,
        path: &std::ffi::OsStr,
        basis: &str,
        selected: &[usize],
    ) -> Result<Option<(String, String)>> {
        if selected.is_empty() {
            bail!("select at least one changed line");
        }
        let index_path = self.index_path().await?;
        let original = read_index(&index_path)?;
        let scratch = Scratch::new(&index_path)?;
        let (view, before, after) = self.capture_diff(path, false, &original, &scratch).await?;
        if view.basis != basis {
            bail!("File, attributes, or index changed; reload the diff");
        }
        if !view.can_select {
            bail!("This diff does not support selected-line discard");
        }
        let selected: HashSet<_> = selected.iter().copied().collect();
        let valid: HashSet<_> = view
            .hunks
            .iter()
            .flat_map(|hunk| &hunk.lines)
            .filter(|line| matches!(line.kind, "added" | "deleted"))
            .map(|line| line.id)
            .collect();
        if !selected.is_subset(&valid) {
            bail!("selection contains a context or unknown line");
        }
        let desired = select_content(&before.bytes, &view.hunks, &selected, true)?;
        if !before.exists() && desired.is_empty() {
            return Ok(None);
        }
        let mode = after
            .entry
            .as_ref()
            .or(before.entry.as_ref())
            .context("missing file mode")?
            .mode
            .clone();
        let oid = self
            .hash_selection(path, desired, view.selection_lfs)
            .await?;
        Ok(Some((mode, oid)))
    }

    async fn hash_selection(&self, path: &OsStr, bytes: Vec<u8>, lfs: bool) -> Result<String> {
        let expected = crate::lfs::LfsObject {
            oid: format!("{:x}", Sha256::digest(&bytes)),
            size: bytes.len() as u64,
        };
        let mut command = args(&["hash-object", "-w", "--stdin"]);
        if lfs {
            command.push("--path".into());
            command.push(path.to_owned());
        }
        let output = process::run_git(&self.path, &command, Some(bytes), None).await?;
        ensure_success(&output)?;
        let oid = std::str::from_utf8(&output.stdout)?.trim().to_owned();
        if lfs {
            let blob = self.run(&args(&["cat-file", "blob", &oid])).await?;
            ensure_success(&blob)?;
            anyhow::ensure!(
                if expected.size == 0 {
                    blob.stdout.is_empty()
                } else {
                    crate::lfs::pointer(&blob.stdout).as_ref() == Some(&expected)
                        && !crate::lfs::has_extensions(&blob.stdout)
                },
                "Git LFS clean did not produce the selected content's pointer; verify LFS filters before retrying"
            );
            if expected.size != 0 {
                let payload = crate::lfs::preview_payload(
                    self.lfs_media_directory().await?,
                    expected.clone(),
                    expected.size,
                )
                .await?;
                anyhow::ensure!(
                    payload.state == "available",
                    "Git LFS did not save a verified payload; index was not changed"
                );
            }
        }
        Ok(oid)
    }

    async fn hydrate_sides(&self, sides: &mut [&mut Side], enabled: bool) -> Result<()> {
        if !enabled {
            return Ok(());
        }
        let mut media = None;
        for side in sides {
            if !side.regular() {
                continue;
            }
            let Some(object) = crate::lfs::pointer(&side.bytes) else {
                continue;
            };
            let payload = if crate::lfs::has_extensions(&side.bytes) {
                crate::lfs::PreviewPayload::unavailable("extension")
            } else if object.size == 0 {
                crate::lfs::PreviewPayload::unavailable(
                    if object.oid == format!("{:x}", Sha256::digest([])) {
                        "available"
                    } else {
                        "corrupt"
                    },
                )
            } else {
                if media.is_none() {
                    media = Some(match self.lfs_media_directory().await {
                        Ok(path) => Some(path),
                        Err(_) => {
                            crate::cancellation::Cancellation::current().check()?;
                            None
                        }
                    });
                }
                match media.as_ref().and_then(|path| path.clone()) {
                    Some(path) => {
                        crate::lfs::preview_payload(path, object.clone(), CONTENT_LIMIT as u64)
                            .await?
                    }
                    None => crate::lfs::PreviewPayload::unavailable("unavailable"),
                }
            };
            side.size = object.size;
            side.bytes = payload.bytes;
            side.oversized = payload.state == "too_large";
            side.lfs = Some(LfsPreview {
                object,
                state: payload.state,
            });
        }
        Ok(())
    }

    async fn capture_diff(
        &self,
        path: &OsStr,
        staged: bool,
        original_index: &Option<Vec<u8>>,
        scratch: &Scratch,
    ) -> Result<(View, Side, Side)> {
        // ls-files excludes ignored metadata and traversals through symlink directories.
        let mut allowed = args(&[
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "-z",
            "--",
        ]);
        allowed.push(path.to_owned());
        let allowed = self.run(&allowed).await?;
        ensure_success(&allowed)?;
        if !allowed
            .stdout
            .split(|b| *b == 0)
            .any(|item| item == path.as_encoded_bytes())
            && !self.head_side(path).await?.exists()
        {
            bail!("path is not a tracked or untracked repository file");
        }
        let index_entry = self.index_entry(path).await?;
        let mut before = if staged {
            let renamed = self
                .run(&args(&[
                    "diff",
                    "--cached",
                    "--name-status",
                    "--find-renames",
                    "-z",
                    "--no-ext-diff",
                    "--no-textconv",
                    "--",
                ]))
                .await?;
            ensure_success(&renamed)?;
            let source = crate::history::staged_rename_source(&renamed.stdout, path)?;
            self.head_side(
                source
                    .map(validate_path)
                    .transpose()?
                    .as_deref()
                    .unwrap_or(path),
            )
            .await?
        } else {
            self.blob_side(if self.intent_to_add(path, index_entry.is_some()).await? {
                None
            } else {
                index_entry.clone()
            })
            .await?
        };
        let mut after = if staged {
            self.blob_side(index_entry).await?
        } else {
            self.worktree_side(path).await?
        };
        let raw_after = after.bytes.clone();
        let mut attributes = args(&[
            "check-attr",
            "-z",
            "filter",
            "working-tree-encoding",
            "eol",
            "text",
            "ident",
            "--",
        ]);
        attributes.push(path.to_owned());
        let attributes = self.run(&attributes).await?;
        ensure_success(&attributes)?;
        let filter = attributes
            .stdout
            .split(|b| *b == 0)
            .nth(2)
            .unwrap_or_default();
        let custom_filter = !matches!(filter, b"unspecified" | b"unset" | b"");
        let lfs_filter = filter == b"lfs";
        // Git blobs identify their content by pointer, even after attributes
        // change. Only interpret working-file pointers when LFS is selected.
        self.hydrate_sides(&mut [&mut before], true).await?;
        self.hydrate_sides(&mut [&mut after], staged || lfs_filter)
            .await?;
        let lfs_configuration = self
            .run(&args(&[
                "config",
                "--null",
                "--get-regexp",
                "^(filter\\.lfs\\.|lfs\\.extension\\.)",
            ]))
            .await?;
        if !matches!(lfs_configuration.code, 0 | 1) {
            ensure_success(&lfs_configuration)?;
        }
        let extensions_configured = lfs_configuration
            .stdout
            .split(|byte| *byte == 0)
            .any(|record| record.starts_with(b"lfs.extension."));

        if !staged && after.exists() && after.regular() && !after.oversized && !custom_filter {
            let mode = after
                .entry
                .as_ref()
                .context("missing worktree mode")?
                .mode
                .clone();
            let mut command = args(&["hash-object", "-w", "--stdin", "--path"]);
            command.push(path.to_owned());
            let hash =
                process::run_git(&self.path, &command, Some(after.bytes.clone()), None).await?;
            ensure_success(&hash)?;
            after = self
                .blob_side(Some(Entry {
                    mode,
                    oid: String::from_utf8(hash.stdout)?.trim().to_owned(),
                }))
                .await?;
        }
        let conversion = self
            .run(&args(&[
                "config",
                "--null",
                "--get-regexp",
                "^core\\.(autocrlf|eol|safecrlf|filemode|symlinks)$",
            ]))
            .await?;
        if !matches!(conversion.code, 0 | 1) {
            ensure_success(&conversion)?;
        }
        let identity = serde_json::to_vec(&(
            before.entry.as_ref().map(|entry| entry.oid.as_str()),
            after.entry.as_ref().map(|entry| entry.oid.as_str()),
            &before.lfs,
            &after.lfs,
        ))?;
        let mut digest = Sha256::new();
        for bytes in [
            identity.as_slice(),
            lfs_configuration.stdout.as_slice(),
            raw_after.as_slice(),
            attributes.stdout.as_slice(),
            conversion.stdout.as_slice(),
            path.as_encoded_bytes(),
            &[u8::from(staged)],
            original_index.as_deref().unwrap_or_default(),
            before.bytes.as_slice(),
            after.bytes.as_slice(),
            before
                .entry
                .as_ref()
                .map_or(b"".as_slice(), |entry| entry.mode.as_bytes()),
            after
                .entry
                .as_ref()
                .map_or(b"".as_slice(), |entry| entry.mode.as_bytes()),
        ] {
            digest.update((bytes.len() as u64).to_le_bytes());
            digest.update(bytes);
        }
        let mut view = View {
            selection_lfs: lfs_filter,
            path: GitPath::Bytes {
                bytes: path.as_encoded_bytes().to_vec(),
            },
            staged,
            kind: "text",
            basis: format!("{:x}", digest.finalize()),
            can_select: false,
            before: before.preview(),
            after: after.preview(),
            hunks: Vec::new(),
        };
        if before.lfs_unavailable() || after.lfs_unavailable() {
            view.kind = "lfs_unavailable";
        } else if before.oversized || after.oversized {
            view.kind = "too_large";
        } else if !before.regular() || !after.regular() {
            view.kind = if before
                .entry
                .as_ref()
                .is_some_and(|entry| entry.mode == "160000")
                || after
                    .entry
                    .as_ref()
                    .is_some_and(|entry| entry.mode == "160000")
            {
                "submodule"
            } else {
                "symlink"
            };
        } else if view.before.image.is_some() || view.after.image.is_some() {
            view.kind = "image";
        } else {
            let mut attr = args(&["check-attr", "-z", "diff", "--"]);
            attr.push(path.to_owned());
            let attr = self.run(&attr).await?;
            ensure_success(&attr)?;
            let binary_attribute = attr.stdout.split(|b| *b == 0).nth(2) == Some(b"unset");
            if binary_attribute || before.bytes.contains(&0) || after.bytes.contains(&0) {
                view.kind = "binary";
            } else {
                fs::write(&scratch.before, &before.bytes)?;
                fs::write(&scratch.after, &after.bytes)?;
                let diff = process::diff_files(&self.path, &scratch.before, &scratch.after).await?;
                if !matches!(diff.code, 0 | 1) {
                    ensure_success(&diff)?;
                }
                view.hunks = parse_hunks(&diff.stdout)?;
                view.can_select = !view.hunks.is_empty()
                    && (!custom_filter || lfs_filter && !extensions_configured)
                    && (lfs_filter || before.lfs.is_none() && after.lfs.is_none());
            }
        }
        Ok((view, before, after))
    }

    pub(crate) async fn commit_file_diff(
        &self,
        path: GitPath,
        revision: &str,
        parent: usize,
    ) -> Result<Value> {
        let path = validate_path(path)?;
        let commit = self.resolve_commit(revision).await?;
        let base = self.commit_parent(&commit, parent).await?;
        let files = self.commit_files(&commit, parent).await?;
        let original = files["files"]
            .as_array()
            .into_iter()
            .flatten()
            .find(|file| {
                serde_json::from_value::<GitPath>(file["path"].clone())
                    .ok()
                    .and_then(|path| validate_path(path).ok())
                    .is_some_and(|candidate| candidate == path)
            })
            .and_then(|file| serde_json::from_value::<GitPath>(file["original_path"].clone()).ok())
            .map(validate_path)
            .transpose()?;
        let mut before = if let Some(base) = base {
            self.tree_side(&base, original.as_deref().unwrap_or(&path))
                .await?
        } else {
            self.blob_side(None).await?
        };
        let mut after = self.tree_side(&commit, &path).await?;
        self.hydrate_sides(&mut [&mut before, &mut after], true)
            .await?;
        if !before.exists() && !after.exists() {
            bail!("file is absent from both commit trees");
        }
        let scratch = Scratch::new(&self.index_path().await?)?;
        let mut view = View {
            selection_lfs: false,
            path: GitPath::Bytes {
                bytes: path.as_encoded_bytes().to_vec(),
            },
            staged: false,
            kind: "text",
            basis: commit,
            can_select: false,
            before: before.preview(),
            after: after.preview(),
            hunks: Vec::new(),
        };
        view.kind = if before.lfs_unavailable() || after.lfs_unavailable() {
            "lfs_unavailable"
        } else if before.oversized || after.oversized {
            "too_large"
        } else if before
            .entry
            .as_ref()
            .is_some_and(|entry| entry.mode == "160000")
            || after
                .entry
                .as_ref()
                .is_some_and(|entry| entry.mode == "160000")
        {
            "submodule"
        } else if !before.regular() || !after.regular() {
            "symlink"
        } else if view.before.image.is_some() || view.after.image.is_some() {
            "image"
        } else if before.bytes.contains(&0) || after.bytes.contains(&0) {
            "binary"
        } else {
            "text"
        };
        if view.kind == "text" {
            fs::write(&scratch.before, &before.bytes)?;
            fs::write(&scratch.after, &after.bytes)?;
            let diff = process::diff_files(&self.path, &scratch.before, &scratch.after).await?;
            if !matches!(diff.code, 0 | 1) {
                ensure_success(&diff)?;
            }
            view.hunks = parse_hunks(&diff.stdout)?;
        }
        Ok(serde_json::to_value(view)?)
    }

    pub(crate) async fn conflict_detail(&self, path: GitPath) -> Result<Value> {
        let path = crate::discard_fs::checked_path(path)?;
        let mut command = args(&["ls-files", "--unmerged", "-z", "--"]);
        command.push(path.clone());
        let output = self.run(&command).await?;
        ensure_success(&output)?;
        let mut digest = Sha256::new();
        digest.update(self.id());
        digest.update(path.as_encoded_bytes());
        digest.update(&output.stdout);
        let gitlink = output
            .stdout
            .split(|byte| *byte == 0)
            .any(|record| record.starts_with(b"160000 "));
        let working = if gitlink {
            None
        } else {
            Some(self.conflict_working_state(&path).await?)
        };
        let context = self.conflict_context(&path).await?;
        digest.update(serde_json::to_vec(&working)?);
        digest.update(&context);
        let mut stages = Vec::new();
        for record in output
            .stdout
            .split(|b| *b == 0)
            .filter(|record| !record.is_empty())
        {
            let (metadata, name) = split_record(record)?;
            if name != path.as_encoded_bytes() {
                continue;
            }
            let fields: Vec<_> = metadata.split_whitespace().collect();
            if fields.len() != 3 {
                bail!("invalid unmerged index entry");
            }
            let mut side = self
                .blob_side(Some(Entry {
                    mode: fields[0].into(),
                    oid: fields[1].into(),
                }))
                .await?;
            self.hydrate_sides(&mut [&mut side], true).await?;
            stages.push(json!({"stage":fields[2].parse::<u8>()?,"preview":side.preview(),"text":(!side.lfs_unavailable()&&!side.oversized&&!side.bytes.contains(&0)&&side.regular()).then(||String::from_utf8_lossy(&side.bytes).into_owned())}));
        }
        if stages.is_empty() {
            bail!("file is no longer conflicted");
        }
        Ok(
            json!({"path":GitPath::Bytes{bytes:path.as_encoded_bytes().to_vec()},"basis":format!("{:x}",digest.finalize()),"stages":stages,"working":working}),
        )
    }

    async fn conflict_working_state(&self, path: &OsStr) -> Result<crate::discard_fs::FileState> {
        let root = self.path.clone();
        let path = path.to_owned();
        crate::cancellation::blocking(move || {
            let root = cap_std::fs::Dir::open_ambient_dir(root, cap_std::ambient_authority())?;
            crate::discard_fs::capture(&root, Path::new(&path), None)
        })
        .await
    }

    async fn conflict_context(&self, path: &OsStr) -> Result<Vec<u8>> {
        let head = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
        ensure_success(&head)?;
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        let directory = self.git_directory().await?;
        let operation = crate::cancellation::blocking(move || {
            crate::discard::operation_certificate(&directory)
        })
        .await?;
        let mut attributes = args(&["check-attr", "-z", "--all", "--"]);
        attributes.push(path.to_owned());
        let attributes = self.run(&attributes).await?;
        ensure_success(&attributes)?;
        let configuration = self.run(&args(&["config", "--null", "--get-regexp", "^(filter\\.|lfs\\.extension\\.|core\\.(autocrlf|eol|safecrlf|filemode|symlinks|checkroundtripencoding))"])).await?;
        if !matches!(configuration.code, 0 | 1) {
            ensure_success(&configuration)?;
        }
        Ok(serde_json::to_vec(&(
            head.stdout,
            symbolic.stdout,
            operation,
            attributes.stdout,
            configuration.stdout,
        ))?)
    }

    /// Stage the externally edited version through a private index, preserving
    /// unrelated staged entries and refusing stale file/operation certificates.
    pub(crate) async fn stage_conflict(
        &self,
        path: GitPath,
        basis: &str,
        allow_markers: bool,
    ) -> Result<Value> {
        let checked = crate::discard_fs::checked_path(path.clone())?;
        let index_path = self.index_path().await?;
        let transaction = IndexTransaction::begin(&index_path)?;
        let original = read_index(&index_path)?.context("missing conflicted index")?;
        let detail = self.conflict_detail(path.clone()).await?;
        anyhow::ensure!(
            detail["basis"].as_str() == Some(basis),
            "Conflict or working file changed; refresh and review the edited resolution"
        );
        anyhow::ensure!(
            detail["stages"].as_array().is_some_and(|stages| stages
                .iter()
                .all(|entry| entry["preview"]["mode"] != "160000")),
            "Use the submodule conflict workflow for gitlinks"
        );
        let scratch = Scratch::new(&index_path)?;
        scratch.write_index(&original)?;
        let mut add = args(&["add", "--"]);
        add.push(checked.clone());
        let output =
            process::run_git(&self.path, &add, None, Some(&scratch.alternate_index)).await?;
        ensure_success(&output)?;
        let mut check = args(&[
            "diff",
            "--cached",
            "--check",
            "--no-ext-diff",
            "--no-textconv",
            "--",
        ]);
        check.push(checked);
        let diagnostic =
            process::conflict_markers(&self.path, &check, Some(&scratch.alternate_index)).await?;
        anyhow::ensure!(
            matches!(diagnostic.code, 0 | 2),
            "cannot check edited resolution for conflict markers"
        );
        let markers = diagnostic
            .stdout
            .split(|byte| *byte == b'\n')
            .filter(|line| line.ends_with(b": leftover conflict marker"))
            .count();
        if markers > 0 && !allow_markers {
            return Ok(
                json!({"code":2,"stdout":"","stderr":"Conflict markers remain. Edit the file and refresh, or explicitly stage the reviewed contents with markers.","requires_confirmation":true,"markers":markers}),
            );
        }
        let replacement = read_index(&scratch.alternate_index)?
            .context("Git did not produce a resolved index")?;
        anyhow::ensure!(
            self.conflict_detail(path.clone()).await?["basis"].as_str() == Some(basis)
                && read_index(&index_path)?.as_ref() == Some(&original),
            "Conflict, working file or filters changed while staging; refresh and review again"
        );
        crate::cancellation::Cancellation::current().check()?;
        self.publish_edited_conflict_with_undo(path, basis, original, replacement, transaction)
            .await
    }

    pub(crate) async fn resolve_conflict(
        &self,
        path: GitPath,
        choice: crate::ConflictChoice,
        basis: &str,
    ) -> Result<Value> {
        self.resolve_conflict_with_undo(path, choice, basis).await
    }

    pub(crate) async fn index_path(&self) -> Result<PathBuf> {
        let output = self
            .run(&args(&[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                "index",
            ]))
            .await?;
        ensure_success(&output)?;
        let bytes = output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout);
        Ok(PathBuf::from(os_from_bytes(bytes)?))
    }

    async fn intent_to_add(&self, path: &OsStr, indexed: bool) -> Result<bool> {
        if !indexed {
            return Ok(false);
        }
        let mut command = args(&[
            "diff",
            "--cached",
            "--raw",
            "--no-abbrev",
            "--no-renames",
            "--no-ext-diff",
            "--no-textconv",
            "--ita-invisible-in-index",
            "-z",
            "--",
        ]);
        command.push(path.to_owned());
        let output = self.run(&command).await?;
        ensure_success(&output)?;
        let absent = output
            .stdout
            .split(|byte| *byte == 0)
            .next()
            .and_then(|header| header.split(|byte| *byte == b' ').nth(1))
            == Some(b"000000".as_slice());
        Ok(absent || output.stdout.is_empty() && !self.head_side(path).await?.exists())
    }

    async fn index_entry(&self, path: &OsStr) -> Result<Option<Entry>> {
        let mut command = args(&["ls-files", "--stage", "-z", "--"]);
        command.push(path.to_owned());
        let output = self.run(&command).await?;
        ensure_success(&output)?;
        let mut found = None;
        for record in output
            .stdout
            .split(|b| *b == 0)
            .filter(|record| !record.is_empty())
        {
            let (metadata, name) = split_record(record)?;
            if name != path.as_encoded_bytes() {
                continue;
            }
            let fields: Vec<_> = metadata.split_whitespace().collect();
            if fields.len() != 3 || fields[2] != "0" {
                bail!("Resolve conflicts before loading a selectable diff");
            }
            found = Some(Entry {
                mode: fields[0].to_owned(),
                oid: fields[1].to_owned(),
            });
        }
        Ok(found)
    }

    async fn head_side(&self, path: &OsStr) -> Result<Side> {
        let head = self.run(&args(&["rev-parse", "--verify", "HEAD"])).await?;
        if head.code != 0 {
            return self.blob_side(None).await;
        }
        self.tree_side("HEAD", path).await
    }

    async fn tree_side(&self, tree: &str, path: &OsStr) -> Result<Side> {
        let mut command = args(&["ls-tree", "-z", tree, "--"]);
        command.push(path.to_owned());
        let output = self.run(&command).await?;
        ensure_success(&output)?;
        let mut entry = None;
        for record in output
            .stdout
            .split(|b| *b == 0)
            .filter(|record| !record.is_empty())
        {
            let (metadata, name) = split_record(record)?;
            if name != path.as_encoded_bytes() {
                continue;
            }
            let fields: Vec<_> = metadata.split_whitespace().collect();
            if fields.len() != 3 {
                bail!("invalid tree entry");
            }
            entry = Some(Entry {
                mode: fields[0].to_owned(),
                oid: fields[2].to_owned(),
            });
        }
        self.blob_side(entry).await
    }

    async fn blob_side(&self, entry: Option<Entry>) -> Result<Side> {
        let mut side = Side {
            lfs: None,
            entry,
            bytes: Vec::new(),
            oversized: false,
            size: 0,
        };
        if let Some(entry) = &side.entry {
            if entry.mode == "160000" {
                return Ok(side);
            }
            let size = self.run(&args(&["cat-file", "-s", &entry.oid])).await?;
            ensure_success(&size)?;
            side.size = std::str::from_utf8(&size.stdout)?.trim().parse::<u64>()?;
            if side.size > CONTENT_LIMIT as u64 {
                side.oversized = true;
                return Ok(side);
            }
            let output = self.run(&args(&["cat-file", "blob", &entry.oid])).await?;
            ensure_success(&output)?;
            side.bytes = output.stdout;
        }
        Ok(side)
    }

    async fn worktree_side(&self, path: &OsStr) -> Result<Side> {
        let mut file_path = self.path.clone();
        let components: Vec<_> = Path::new(path).components().collect();
        for (i, component) in components.iter().enumerate() {
            file_path.push(component.as_os_str());
            if i + 1 < components.len()
                && fs::symlink_metadata(&file_path)
                    .is_ok_and(|metadata| metadata.file_type().is_symlink())
            {
                bail!("path traverses a symlink directory");
            }
        }
        let metadata = match fs::symlink_metadata(&file_path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                return Ok(Side {
                    lfs: None,
                    entry: None,
                    bytes: Vec::new(),
                    oversized: false,
                    size: 0,
                });
            }
            Err(error) => return Err(error.into()),
        };
        let mut mode = if metadata.file_type().is_symlink() {
            "120000"
        } else if metadata.is_dir() {
            let entry = self.index_entry(path).await?;
            if entry.as_ref().is_some_and(|entry| entry.mode == "160000") {
                let mut entry = entry;
                if file_path.join(".git").exists() {
                    let head =
                        process::run(&file_path, &args(&["rev-parse", "--verify", "HEAD"])).await?;
                    if head.code == 0 {
                        entry.as_mut().context("missing gitlink")?.oid =
                            String::from_utf8(head.stdout)?.trim().to_owned();
                    }
                }
                return Ok(Side {
                    lfs: None,
                    entry,
                    bytes: Vec::new(),
                    oversized: false,
                    size: 0,
                });
            }
            bail!("path is a directory");
        } else {
            file_mode(&metadata)
        };
        if matches!(mode, "100644" | "100755") {
            let policy = self
                .run(&args(&["config", "--type=bool", "core.filemode"]))
                .await?;
            if policy.stdout.starts_with(b"false") {
                mode = if self
                    .index_entry(path)
                    .await?
                    .is_some_and(|entry| entry.mode == "100755")
                {
                    "100755"
                } else {
                    "100644"
                };
            }
        }
        let oversized = metadata.len() > CONTENT_LIMIT as u64;
        let bytes = if oversized {
            Vec::new()
        } else if mode == "120000" {
            fs::read_link(&file_path)?
                .as_os_str()
                .as_encoded_bytes()
                .to_vec()
        } else {
            read_bounded_file(&file_path, CONTENT_LIMIT as u64)?
        };
        let after = fs::symlink_metadata(&file_path)?;
        if metadata.len() != after.len() || metadata.modified().ok() != after.modified().ok() {
            bail!("File changed while reading; reload the diff");
        }
        Ok(Side {
            lfs: None,
            entry: Some(Entry {
                mode: mode.to_owned(),
                oid: String::new(),
            }),
            bytes,
            oversized,
            size: metadata.len(),
        })
    }
}

fn ensure_success(output: &process::RawOutput) -> Result<()> {
    if output.code != 0 {
        bail!("{}", String::from_utf8_lossy(&output.stderr));
    }
    Ok(())
}
fn split_record(record: &[u8]) -> Result<(&str, &[u8])> {
    let split = record
        .iter()
        .position(|b| *b == b'\t')
        .context("invalid Git entry")?;
    Ok((std::str::from_utf8(&record[..split])?, &record[split + 1..]))
}
fn file_mode(metadata: &fs::Metadata) -> &'static str {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if metadata.permissions().mode() & 0o111 != 0 {
            "100755"
        } else {
            "100644"
        }
    }
    #[cfg(not(unix))]
    {
        let _ = metadata;
        "100644"
    }
}
fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}
fn read_bounded_file(path: &Path, limit: u64) -> Result<Vec<u8>> {
    let mut bytes = Vec::new();
    File::open(path)?.take(limit + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > limit {
        bail!("file exceeds size limit");
    }
    Ok(bytes)
}
pub(crate) fn read_index(path: &Path) -> Result<Option<Vec<u8>>> {
    match read_bounded_file(path, INDEX_LIMIT) {
        Ok(bytes) => Ok(Some(bytes)),
        Err(error)
            if error
                .downcast_ref::<std::io::Error>()
                .is_some_and(|error| error.kind() == std::io::ErrorKind::NotFound) =>
        {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

struct Scratch {
    index_path: PathBuf,
    directory: PathBuf,
    alternate_index: PathBuf,
    before: PathBuf,
    after: PathBuf,
}
impl Scratch {
    fn new(index_path: &Path) -> Result<Self> {
        let parent = index_path.parent().context("index has no parent")?;
        let directory = parent.join(format!("desktop-diff-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&directory)?;
        Ok(Self {
            index_path: index_path.to_owned(),
            alternate_index: directory.join("index"),
            before: directory.join("before"),
            after: directory.join("after"),
            directory,
        })
    }
    fn write_index(&self, bytes: &[u8]) -> Result<()> {
        fs::write(&self.alternate_index, bytes)?;
        Ok(())
    }
}
impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.directory);
    }
}
pub(crate) struct IndexTransaction {
    path: PathBuf,
    lock_path: PathBuf,
    lock: File,
    committed: bool,
}
impl IndexTransaction {
    pub(crate) fn begin(path: &Path) -> Result<Self> {
        let mut lock_path = path.as_os_str().to_owned();
        lock_path.push(".lock");
        let lock_path = PathBuf::from(lock_path);
        let lock = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&lock_path)
            .context("Git index is locked; wait for the other Git operation to finish")?;
        let transaction = Self {
            path: path.to_owned(),
            lock_path,
            lock,
            committed: false,
        };
        if let Ok(metadata) = fs::metadata(path) {
            transaction.lock.set_permissions(metadata.permissions())?;
        }
        Ok(transaction)
    }
    pub(crate) fn commit(&mut self, bytes: &[u8]) -> Result<()> {
        self.lock.write_all(bytes)?;
        self.lock.sync_all()?;
        fs::rename(&self.lock_path, &self.path)?;
        self.committed = true;
        #[cfg(unix)]
        File::open(self.path.parent().context("index has no parent")?)?.sync_all()?;
        Ok(())
    }
}
impl Drop for IndexTransaction {
    fn drop(&mut self) {
        if !self.committed {
            let _ = fs::remove_file(&self.lock_path);
        }
    }
}

fn parse_hunks(patch: &[u8]) -> Result<Vec<Hunk>> {
    let mut hunks = Vec::<Hunk>::new();
    let mut id = 0;
    let mut old_cursor = 0;
    let mut new_cursor = 0;
    for raw in patch.split_inclusive(|b| *b == b'\n') {
        if raw.starts_with(b"@@ ") {
            let header = std::str::from_utf8(raw)?;
            let mut parts = header.split_whitespace();
            parts.next();
            let (old_start, old_count) = parse_range(parts.next().context("missing old range")?)?;
            let (new_start, new_count) = parse_range(parts.next().context("missing new range")?)?;
            old_cursor = old_start;
            new_cursor = new_start;
            hunks.push(Hunk {
                old_start,
                old_count,
                new_start,
                new_count,
                lines: Vec::new(),
            });
            continue;
        }
        let Some(hunk) = hunks.last_mut() else {
            continue;
        };
        if raw.starts_with(b"\\ No newline at end of file") {
            let previous = hunk
                .lines
                .last_mut()
                .context("newline marker without a line")?;
            previous.no_newline = true;
            if previous.bytes.ends_with(b"\n") {
                previous.bytes.pop();
            }
            continue;
        }
        let kind = match raw.first() {
            Some(b' ') => "context",
            Some(b'+') => "added",
            Some(b'-') => "deleted",
            _ => bail!("invalid diff line"),
        };
        let old_line = (kind != "added").then_some(old_cursor);
        let new_line = (kind != "deleted").then_some(new_cursor);
        if kind != "added" {
            old_cursor += 1;
        }
        if kind != "deleted" {
            new_cursor += 1;
        }
        let bytes = raw[1..].to_vec();
        let text =
            String::from_utf8_lossy(bytes.strip_suffix(b"\n").unwrap_or(&bytes)).into_owned();
        hunk.lines.push(Line {
            id,
            kind,
            old_line,
            new_line,
            text,
            no_newline: false,
            bytes,
        });
        id += 1;
    }
    Ok(hunks)
}
fn parse_range(value: &str) -> Result<(usize, usize)> {
    let value = &value[1..];
    if let Some((start, count)) = value.split_once(',') {
        Ok((start.parse()?, count.parse()?))
    } else {
        Ok((value.parse()?, 1))
    }
}
fn select_content(
    old: &[u8],
    hunks: &[Hunk],
    selected: &HashSet<usize>,
    reverse: bool,
) -> Result<Vec<u8>> {
    let old_lines: Vec<_> = old.split_inclusive(|b| *b == b'\n').collect();
    let mut cursor = 0;
    let mut desired = Vec::new();
    for hunk in hunks {
        let start = if hunk.old_count == 0 {
            hunk.old_start
        } else {
            hunk.old_start.saturating_sub(1)
        };
        if start < cursor || start > old_lines.len() {
            bail!("invalid diff old range");
        }
        for line in &old_lines[cursor..start] {
            desired.extend(*line);
        }
        cursor = start;
        for line in &hunk.lines {
            let include = match line.kind {
                "context" => true,
                "deleted" => selected.contains(&line.id) == reverse,
                "added" => selected.contains(&line.id) != reverse,
                _ => false,
            };
            if line.kind != "added" {
                if old_lines.get(cursor) != Some(&line.bytes.as_slice()) {
                    bail!("diff no longer matches its captured base");
                }
                cursor += 1;
            }
            if include {
                desired.extend(&line.bytes);
            }
        }
    }
    for line in &old_lines[cursor..] {
        desired.extend(*line);
    }
    Ok(desired)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_final_newline_changes_in_both_directions() {
        let hunks = parse_hunks(
            b"--- a\n+++ b\n@@ -1,2 +1,2 @@\n a\n-old\n\\ No newline at end of file\n+new\n",
        )
        .unwrap();
        let selected = HashSet::from([1, 2]);
        assert!(hunks[0].lines[1].no_newline);
        assert_eq!(
            select_content(b"a\nold", &hunks, &selected, false).unwrap(),
            b"a\nnew\n"
        );
        assert_eq!(
            select_content(b"a\nold", &hunks, &selected, true).unwrap(),
            b"a\nold"
        );
    }

    #[test]
    fn handles_empty_base_and_zero_length_old_ranges() {
        let hunks =
            parse_hunks(b"@@ -0,0 +1,2 @@\n+first\n+last\n\\ No newline at end of file\n").unwrap();
        assert_eq!(
            select_content(b"", &hunks, &HashSet::from([1]), false).unwrap(),
            b"last"
        );
    }
}
