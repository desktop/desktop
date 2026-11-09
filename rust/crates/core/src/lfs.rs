//! Git LFS inspection/setup and verified, local-only payload recovery.
use crate::{
    GitPath, Repository, args, cancellation, discard_fs as work, os_from_bytes, validate_path,
};
use anyhow::{Context, Result, bail};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::PathBuf,
};

/// Configuration scope for an explicitly requested LFS installation.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LfsInstallScope {
    #[default]
    Local,
    Global,
}

/// The content-addressed bytes referenced by a Git LFS pointer.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct LfsObject {
    pub oid: String,
    pub size: u64,
}
impl LfsObject {
    pub fn validate(&self) -> Result<()> {
        anyhow::ensure!(
            self.oid.len() == 64
                && self
                    .oid
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
            "invalid LFS object ID"
        );
        Ok(())
    }
}

/// Recognize v1 payload references, including historical noncanonical pointers.
/// Pointer bytes are backed up verbatim, including unknown and extension fields.
/// Detection is conservative: ambiguous fields are treated as ordinary content.
pub(crate) fn pointer(bytes: &[u8]) -> Option<LfsObject> {
    if bytes.is_empty() || bytes.len() >= 1024 {
        return None;
    }
    let text = std::str::from_utf8(bytes).ok()?.trim();
    let mut version = None;
    let mut oid = None;
    let mut size = None;
    for line in text.lines().filter(|line| !line.is_empty()) {
        let (key, value) = line.split_once(' ')?;
        match key {
            "version" => {
                if version.is_some()
                    || !matches!(
                        value,
                        "https://git-lfs.github.com/spec/v1"
                            | "https://hawser.github.com/spec/v1"
                            | "http://git-media.io/v/2"
                    )
                {
                    return None;
                }
                version = Some(value);
            }
            "oid" => {
                if oid.is_some() {
                    return None;
                }
                oid = Some(value.strip_prefix("sha256:")?.to_owned());
            }
            "size" => {
                if size.is_some() {
                    return None;
                }
                let number: i64 = value.parse().ok()?;
                size = Some(u64::try_from(number).ok()?);
            }
            _ => {
                if key.is_empty() || value.is_empty() {
                    return None;
                }
            }
        }
    }
    version?;
    let object = LfsObject {
        oid: oid?,
        size: size?,
    };
    object.validate().ok()?;
    Some(object)
}

impl Repository {
    pub(crate) async fn lfs_status(&self, paths: Vec<GitPath>) -> Result<Value> {
        anyhow::ensure!(paths.len() <= 1000, "inspect at most 1000 paths at once");
        let mut command = args(&["check-attr", "-z", "filter", "--"]);
        for path in &paths {
            command.push(validate_path(path.clone())?);
        }
        let mut files = Vec::new();
        if !paths.is_empty() {
            let output = checked(self.run(&command).await?)?;
            let fields: Vec<_> = output.stdout.split(|byte| *byte == 0).collect();
            anyhow::ensure!(
                fields.len() == paths.len() * 3 + 1 && fields.last() == Some(&b"".as_slice()),
                "invalid Git attribute response"
            );
            for (path, fields) in paths.into_iter().zip(fields.as_chunks::<3>().0) {
                anyhow::ensure!(fields[1] == b"filter", "unexpected Git attribute");
                files.push(json!({"path":path,"display_path":String::from_utf8_lossy(fields[0]),"tracked":fields[2] == b"lfs"}));
            }
        }
        let version = crate::process::run_lfs(&self.path, &args(&["lfs", "version"])).await?;
        if version.code != 0 {
            // Git's diagnostic may contain configured URLs. Return a fixed hint.
            return Ok(
                json!({"available":false,"version":null,"using_lfs":null,"patterns":[],"files":files,"hint":"Install git-lfs and add it to PATH (Termux: pkg install git-lfs)."}),
            );
        }
        let patterns = crate::lfs_attributes::inspect(self).await?;
        Ok(
            json!({"available":true,"version":String::from_utf8(version.stdout)?.trim(),"using_lfs":patterns.iter().any(|pattern|pattern.tracked),"patterns":patterns,"files":files}),
        )
    }

    /// Ask Git LFS for its effective media directory, including custom storage
    /// and linked-worktree configuration. Never expose endpoint credentials.
    pub(crate) async fn lfs_media_directory(&self) -> Result<PathBuf> {
        let output = crate::process::run_lfs(&self.path, &args(&["lfs", "env"])).await?;
        anyhow::ensure!(
            output.code == 0,
            "Git LFS is required to preserve pointer payloads; install git-lfs and retry"
        );
        media_directory_from_env(&output.stdout)
    }
}
/// Cross-check both paths so newline-containing storage names cannot be
/// truncated into a different directory by the human-readable env format.
fn media_directory_from_env(output: &[u8]) -> Result<PathBuf> {
    let field = |prefix: &[u8]| -> Result<PathBuf> {
        let entries: Vec<_> = output
            .split(|byte| *byte == b'\n')
            .filter_map(|line| line.strip_prefix(prefix))
            .collect();
        anyhow::ensure!(
            entries.len() == 1 && !entries[0].is_empty(),
            "unable to resolve local Git LFS storage paths"
        );
        let path = PathBuf::from(os_from_bytes(entries[0])?);
        anyhow::ensure!(path.is_absolute(), "Git LFS storage path must be absolute");
        Ok(path)
    };
    let media = field(b"LocalMediaDir=")?;
    let storage = field(b"LfsStorageDir=")?;
    anyhow::ensure!(
        media == storage.join("objects"),
        "ambiguous Git LFS storage paths; newline-containing cache locations are unsupported"
    );
    Ok(media)
}

fn checked(output: crate::process::RawOutput) -> Result<crate::process::RawOutput> {
    if output.code != 0 {
        bail!("Git LFS inspection failed (exit {})", output.code);
    }
    Ok(output)
}

/// Keep cache traversal beneath an opened media directory; shard/leaf symlinks
/// are refused. The configured media directory itself may be a symlink.
fn shard(media: &Dir, object: &LfsObject, create: bool) -> Result<Dir> {
    object.validate()?;
    let mut directory = media.try_clone()?;
    for name in [&object.oid[..2], &object.oid[2..4]] {
        if create {
            match directory.create_dir(name) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(error) => return Err(error.into()),
            }
        }
        directory = directory
            .open_dir_nofollow(name)
            .context("LFS cache shard is missing, inaccessible, or a symlink")?;
    }
    Ok(directory)
}
fn open_object(directory: &Dir, name: &str) -> std::io::Result<fs::File> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        // A malformed cache entry must not block opening a FIFO indefinitely.
        options.custom_flags(libc::O_NONBLOCK);
    }
    Ok(directory.open_with(name, &options)?.into_std())
}

pub(crate) fn has_extensions(bytes: &[u8]) -> bool {
    std::str::from_utf8(bytes).is_ok_and(|text| text.lines().any(|line| line.starts_with("ext-")))
}

pub(crate) struct PreviewPayload {
    pub state: &'static str,
    pub bytes: Vec<u8>,
}
impl PreviewPayload {
    pub fn unavailable(state: &'static str) -> Self {
        Self {
            state,
            bytes: Vec::new(),
        }
    }
}

/// Read only local, ordinary cache files. Bound memory independently of pointer
/// claims, and certify every byte before exposing a text/image preview.
pub(crate) async fn preview_payload(
    media: PathBuf,
    object: LfsObject,
    limit: u64,
) -> Result<PreviewPayload> {
    cancellation::blocking(move || {
        object.validate()?;
        let result = (|| -> Result<PreviewPayload> {
            let media = Dir::open_ambient_dir(media, ambient_authority())?;
            let shard = shard(&media, &object, false)?;
            let mut file = open_object(&shard, &object.oid)?;
            let before = file.metadata()?;
            if !before.is_file() {
                return Ok(PreviewPayload::unavailable("unavailable"));
            }
            if before.len() != object.size {
                return Ok(PreviewPayload::unavailable("corrupt"));
            }
            if object.size > limit {
                return Ok(PreviewPayload::unavailable("too_large"));
            }
            let mut bytes = Vec::new();
            let mut buffer = [0; 64 * 1024];
            loop {
                cancellation::Cancellation::current().check()?;
                let count = file.read(&mut buffer)?;
                if count == 0 {
                    break;
                }
                if bytes.len() as u64 + count as u64 > limit {
                    return Ok(PreviewPayload::unavailable("corrupt"));
                }
                bytes.extend_from_slice(&buffer[..count]);
            }
            let after = file.metadata()?;
            if before.len() != after.len()
                || before.modified().ok() != after.modified().ok()
                || bytes.len() as u64 != object.size
                || format!("{:x}", Sha256::digest(&bytes)) != object.oid
            {
                return Ok(PreviewPayload::unavailable("corrupt"));
            }
            Ok(PreviewPayload {
                state: "available",
                bytes,
            })
        })();
        match result {
            Ok(payload) => Ok(payload),
            Err(error) => {
                cancellation::Cancellation::current().check()?;
                let missing = error
                    .chain()
                    .filter_map(|cause| cause.downcast_ref::<std::io::Error>())
                    .any(|error| error.kind() == std::io::ErrorKind::NotFound);
                Ok(PreviewPayload::unavailable(if missing {
                    "missing"
                } else {
                    "unavailable"
                }))
            }
        }
    })
    .await
}

/// Retain every readable original payload for a conflict journal. Objects
/// already missing/inaccessible are recorded as unavailable, not fabricated.
/// Copy/write failures still abort preparation before a resolution is applied.
pub(crate) async fn save_available_payloads(
    media: PathBuf,
    journal: PathBuf,
    objects: Vec<LfsObject>,
) -> Result<(Vec<LfsObject>, Vec<LfsObject>)> {
    cancellation::blocking(move || {
        let mut saved = Vec::new();
        let mut unavailable = Vec::new();
        let media = Dir::open_ambient_dir(media, ambient_authority()).ok();
        for object in objects {
            cancellation::Cancellation::current().check()?;
            let source = media
                .as_ref()
                .and_then(|media| shard(media, &object, false).ok())
                .and_then(|directory| open_object(&directory, &object.oid).ok());
            let Some(source) = source else {
                unavailable.push(object);
                continue;
            };
            if !source.metadata()?.is_file() {
                unavailable.push(object);
                continue;
            }
            let backup = journal.join(format!("lfs-{}", object.oid));
            let state = work::copy_state(source, Some(&backup))?;
            if state.size != object.size || state.sha256 != object.oid {
                fs::remove_file(backup)?;
                unavailable.push(object);
            } else {
                saved.push(object);
            }
        }
        Ok((saved, unavailable))
    })
    .await
}

pub(crate) async fn save_payloads(
    media: PathBuf,
    journal: PathBuf,
    objects: Vec<LfsObject>,
) -> Result<()> {
    cancellation::blocking(move || {
        let media = Dir::open_ambient_dir(media, ambient_authority())
            .context("local LFS payloads are missing; fetch them before discarding")?;
        for object in objects {
            let directory = shard(&media, &object, false)?;
            let source = open_object(&directory, &object.oid)
                .context("local LFS payload is missing; fetch it before discarding")?;
            let state =
                work::copy_state(source, Some(&journal.join(format!("lfs-{}", object.oid))))?;
            anyhow::ensure!(
                state.size == object.size && state.sha256 == object.oid,
                "local LFS payload is corrupt; no changes discarded"
            );
        }
        Ok(())
    })
    .await
}

pub(crate) async fn restore_payloads(
    media: PathBuf,
    journal: PathBuf,
    objects: Vec<LfsObject>,
) -> Result<()> {
    cancellation::blocking(move || {
        fs::create_dir_all(&media)?;
        let media = Dir::open_ambient_dir(media, ambient_authority())?;
        for object in objects {
            object.validate()?;
            let source = journal.join(format!("lfs-{}", object.oid));
            let state = work::copy_state(fs::File::open(&source)?, None)?;
            anyhow::ensure!(
                state.size == object.size && state.sha256 == object.oid,
                "saved LFS payload was changed; undo data retained"
            );
            let directory = shard(&media, &object, true)?;
            match open_object(&directory, &object.oid) {
                Ok(file) => {
                    let state = work::copy_state(file, None)?;
                    anyhow::ensure!(
                        state.size == object.size && state.sha256 == object.oid,
                        "existing LFS payload is corrupt; undo data retained"
                    );
                    continue;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(error).context("LFS payload is inaccessible or a symlink");
                }
            }
            let temporary = format!(".desktop-lfs-{}", uuid::Uuid::new_v4());
            let mut options = OpenOptions::new();
            options.write(true).create_new(true);
            #[cfg(unix)]
            {
                use cap_std::fs::OpenOptionsExt;
                options.mode(0o600);
            }
            let mut output = directory.open_with(&temporary, &options)?.into_std();
            let result = (|| -> Result<()> {
                let mut input = fs::File::open(&source)?;
                let mut digest = Sha256::new();
                let mut size = 0;
                let mut buffer = [0; 64 * 1024];
                loop {
                    cancellation::Cancellation::current().check()?;
                    let count = input.read(&mut buffer)?;
                    if count == 0 {
                        break;
                    }
                    output.write_all(&buffer[..count])?;
                    digest.update(&buffer[..count]);
                    size += count as u64;
                }
                anyhow::ensure!(
                    size == object.size && format!("{:x}", digest.finalize()) == object.oid,
                    "saved LFS payload changed during recovery"
                );
                output.sync_all()?;
                // Publish without replacing a concurrently created object.
                match publish_object(&directory, &temporary, &object.oid) {
                    Ok(()) => {}
                    Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
                        let state = work::copy_state(open_object(&directory, &object.oid)?, None)?;
                        anyhow::ensure!(
                            state.size == object.size && state.sha256 == object.oid,
                            "LFS cache changed during recovery"
                        );
                    }
                    Err(error) => return Err(error).context("publish restored LFS payload"),
                }
                #[cfg(unix)]
                directory.open(".")?.into_std().sync_all()?;
                Ok(())
            })();
            drop(output);
            let cleanup = directory.remove_file(&temporary);
            result?;
            if let Err(error) = cleanup
                && error.kind() != std::io::ErrorKind::NotFound
            {
                return Err(error.into());
            }
        }
        Ok(())
    })
    .await
}

/// Android disallows hard links even inside private app storage. Linux's
/// no-replace rename keeps atomic publication without requiring hard links.
fn publish_object(directory: &Dir, temporary: &str, oid: &str) -> std::io::Result<()> {
    #[cfg(any(target_os = "linux", target_os = "android"))]
    {
        use std::{ffi::CString, os::fd::AsRawFd};
        let source = CString::new(temporary)?;
        let target = CString::new(oid)?;
        // Both names are single validated components relative to the same
        // live directory handle. CString storage outlives the syscall.
        let result = unsafe {
            libc::renameat2(
                directory.as_raw_fd(),
                source.as_ptr(),
                directory.as_raw_fd(),
                target.as_ptr(),
                libc::RENAME_NOREPLACE as _,
            )
        };
        if result == 0 {
            Ok(())
        } else {
            Err(std::io::Error::last_os_error())
        }
    }
    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    directory.hard_link(temporary, directory, oid)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn cache_paths_cannot_be_truncated_by_env_line_breaks() {
        let root = std::env::temp_dir().join("desktop-lfs-env");
        let valid = format!(
            "LocalMediaDir={}/objects\nLfsStorageDir={}\n",
            root.display(),
            root.display()
        );
        assert_eq!(
            media_directory_from_env(valid.as_bytes()).unwrap(),
            root.join("objects")
        );
        for bad in [
            valid.replace("/objects\n", "/objects\nLocalMediaDir=/other\n"),
            valid.replace("desktop-lfs-env", "first\nsecond"),
            valid.replace("LfsStorageDir=", "Missing="),
        ] {
            assert!(media_directory_from_env(bad.as_bytes()).is_err());
        }
    }
    #[test]
    fn pointers_preserve_extensions_and_reject_ambiguous_text() {
        let oid = "a".repeat(64);
        let standard =
            format!("version https://git-lfs.github.com/spec/v1\noid sha256:{oid}\nsize 42\n");
        assert_eq!(
            pointer(standard.as_bytes()),
            Some(LfsObject {
                oid: oid.clone(),
                size: 42
            })
        );
        assert!(
            pointer(
                standard
                    .replace(
                        "oid sha256:",
                        &format!("ext-0-zip sha256:{oid}\noid sha256:")
                    )
                    .as_bytes()
            )
            .is_some()
        );
        assert!(
            pointer(
                standard
                    .replace("git-lfs.github", "hawser.github")
                    .as_bytes()
            )
            .is_some()
        );
        for accepted in [
            standard.replace("size 42", "size +042"),
            standard.replace('\n', "\r\n"),
            standard.trim_end().to_owned(),
            standard.replace(
                "https://git-lfs.github.com/spec/v1",
                "http://git-media.io/v/2",
            ),
        ] {
            assert!(pointer(accepted.as_bytes()).is_some(), "{accepted}");
        }
        for invalid in [
            standard.replace("size 42", "size -1"),
            standard.replace("size 42", "size 42\nsize 42"),
            standard.replace("version https", "version HTTPS"),
            standard.replace('a', "A"),
            String::new(),
            format!("{standard}x {}\n", "a".repeat(1024)),
        ] {
            assert!(pointer(invalid.as_bytes()).is_none(), "{invalid}");
        }
    }
}
