//! Safe local Git configuration preflight for publication continuation.
use anyhow::{Context, Result, ensure};
use cap_fs_ext::{DirExt, FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use std::{
    io::{Read, Write},
    path::{Path, PathBuf},
};

const POINTER_LIMIT: u64 = 64 * 1024;

/// Check Git's local configuration without starting Git or following final
/// symlinks. This precedes CLI repository discovery and is repeated inside an
/// already-open WebSocket session. It is a witness, not a filesystem lock.
pub async fn publication_config_preflight(path: &Path) -> Result<()> {
    let path = path.to_owned();
    let scan_path = path.clone();
    let (snapshot, external) = crate::cancellation::blocking(move || {
        verify_environment()?;
        Ok((capture(&scan_path)?, external_configs(&scan_path)?))
    })
    .await?;
    for bytes in std::iter::once(snapshot.local_bytes())
        .chain(snapshot.worktree_bytes())
        .chain(external.iter().map(Vec::as_slice))
    {
        let parsed = crate::process::parse_git_config(bytes.to_vec())
            .await
            .map_err(|_| anyhow::anyhow!("Cannot safely inspect Git configuration"))?;
        ensure!(parsed.code == 0, "Cannot safely inspect Git configuration");
        reject_includes(&parsed.stdout)?;
    }
    Ok(())
}

fn read_pointer(dir: &Dir, name: &str, optional: bool) -> Result<Option<Vec<u8>>> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = match dir.open_with(name, &options) {
        Ok(file) => file,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => anyhow::bail!("Cannot safely inspect repository Git metadata"),
    };
    ensure!(
        file.metadata()?.is_file(),
        "Cannot safely inspect repository Git metadata"
    );
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(POINTER_LIMIT + 1)
        .read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= POINTER_LIMIT as usize,
        "Cannot safely inspect repository Git metadata"
    );
    Ok(Some(bytes))
}

fn pointer_path(base: &Path, bytes: &[u8]) -> Result<PathBuf> {
    let bytes = bytes.strip_suffix(b"\n").unwrap_or(bytes);
    let bytes = bytes.strip_suffix(b"\r").unwrap_or(bytes);
    ensure!(
        !bytes.is_empty() && !bytes.contains(&0) && !bytes.contains(&b'\n'),
        "Invalid repository Git metadata"
    );
    let path = PathBuf::from(crate::os_from_bytes(bytes)?);
    Ok(if path.is_absolute() {
        path
    } else {
        base.join(path)
    })
}

fn safe_config(dir: &Dir, name: &str, optional: bool) -> Result<()> {
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let file = match dir.open_with(name, &options) {
        Ok(file) => file,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(_) => anyhow::bail!("Cannot safely inspect Git configuration"),
    };
    let metadata = file.into_std().metadata()?;
    ensure!(
        metadata.is_file(),
        "Cannot safely inspect Git configuration"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        ensure!(
            metadata.nlink() == 1
                && metadata.uid() == unsafe { libc::geteuid() }
                && metadata.mode() & 0o022 == 0,
            "Cannot safely inspect Git configuration"
        );
    }
    Ok(())
}

#[cfg(test)]
fn preflight(path: &Path) -> Result<()> {
    discover(path).map(|_| ())
}

fn discover(path: &Path) -> Result<(PathBuf, PathBuf)> {
    let path = path
        .canonicalize()
        .map_err(|_| anyhow::anyhow!("Cannot inspect repository path"))?;
    let mut candidate = if path.is_dir() {
        path
    } else {
        path.parent()
            .context("Cannot inspect repository path")?
            .to_owned()
    };
    loop {
        let root = Dir::open_ambient_dir(&candidate, ambient_authority())
            .map_err(|_| anyhow::anyhow!("Cannot inspect repository path"))?;
        match root.symlink_metadata(".git") {
            Ok(metadata) => {
                ensure!(
                    !metadata.file_type().is_symlink(),
                    "Cannot safely inspect repository Git metadata"
                );
                let git_path = if metadata.is_dir() {
                    root.open_dir_nofollow(".git").map_err(|_| {
                        anyhow::anyhow!("Cannot safely inspect repository Git metadata")
                    })?;
                    candidate.join(".git")
                } else {
                    ensure!(
                        metadata.is_file(),
                        "Cannot safely inspect repository Git metadata"
                    );
                    let pointer = read_pointer(&root, ".git", false)?
                        .context("Missing repository Git metadata")?;
                    let pointer = pointer
                        .strip_prefix(b"gitdir: ")
                        .context("Invalid repository Git metadata")?;
                    pointer_path(&candidate, pointer)?
                };
                let git_path = git_path.canonicalize().map_err(|_| {
                    anyhow::anyhow!("Cannot safely inspect repository Git metadata")
                })?;
                let git_dir =
                    Dir::open_ambient_dir(&git_path, ambient_authority()).map_err(|_| {
                        anyhow::anyhow!("Cannot safely inspect repository Git metadata")
                    })?;
                let common_path =
                    match read_pointer(&git_dir, "commondir", true)? {
                        Some(pointer) => pointer_path(&git_path, &pointer)?
                            .canonicalize()
                            .map_err(|_| {
                                anyhow::anyhow!("Cannot safely inspect repository Git metadata")
                            })?,
                        None => git_path.clone(),
                    };
                let common =
                    Dir::open_ambient_dir(&common_path, ambient_authority()).map_err(|_| {
                        anyhow::anyhow!("Cannot safely inspect repository Git metadata")
                    })?;
                safe_config(&common, "config", false)?;
                safe_config(&git_dir, "config.worktree", true)?;
                return Ok((git_path, common_path));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(_) => anyhow::bail!("Cannot safely inspect repository Git metadata"),
        }
        if !candidate.pop() {
            anyhow::bail!("Repository Git metadata was not found");
        }
    }
}

/// Private witness for the exact bytes and identity that would be replaced.
#[derive(Clone, PartialEq, Eq, serde::Serialize)]
pub(crate) struct OriginConfigSnapshot {
    git_dir: Vec<u8>,
    common_dir: Vec<u8>,
    config: ConfigFile,
    worktree: Option<ConfigFile>,
}
#[derive(Clone, PartialEq, Eq, serde::Serialize)]
struct ConfigFile {
    bytes: Vec<u8>,
    device: u64,
    inode: u64,
    mode: u32,
    modified: i64,
    modified_ns: i64,
    changed: i64,
    changed_ns: i64,
}

#[cfg(unix)]
fn capture_file(dir: &Dir, name: &str, optional: bool) -> Result<Option<ConfigFile>> {
    use cap_std::fs::OpenOptionsExt;
    use std::os::unix::fs::MetadataExt;
    let mut options = OpenOptions::new();
    options
        .read(true)
        .follow(FollowSymlinks::No)
        .custom_flags(libc::O_NONBLOCK);
    let file = match dir.open_with(name, &options) {
        Ok(file) => file,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => anyhow::bail!("Cannot safely inspect Git configuration"),
    };
    let mut file = file.into_std();
    let meta = file.metadata()?;
    ensure!(
        meta.is_file()
            && meta.nlink() == 1
            && meta.uid() == unsafe { libc::geteuid() }
            && meta.mode() & 0o022 == 0
            && meta.len() <= 4 * 1024 * 1024,
        "Cannot safely inspect Git configuration"
    );
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= 4 * 1024 * 1024,
        "Git configuration is too large"
    );
    let after = file.metadata()?;
    ensure!(
        meta.dev() == after.dev()
            && meta.ino() == after.ino()
            && meta.len() == after.len()
            && meta.mtime() == after.mtime()
            && meta.mtime_nsec() == after.mtime_nsec()
            && meta.ctime() == after.ctime()
            && meta.ctime_nsec() == after.ctime_nsec(),
        "Git configuration changed during inspection"
    );
    Ok(Some(ConfigFile {
        bytes,
        device: meta.dev(),
        inode: meta.ino(),
        mode: meta.mode(),
        modified: meta.mtime(),
        modified_ns: meta.mtime_nsec(),
        changed: meta.ctime(),
        changed_ns: meta.ctime_nsec(),
    }))
}
#[cfg(not(unix))]
fn capture_file(_: &Dir, _: &str, _: bool) -> Result<Option<ConfigFile>> {
    anyhow::bail!("Git configuration identity cannot be verified on this platform")
}

pub(crate) fn capture(path: &Path) -> Result<OriginConfigSnapshot> {
    let (git_path, common_path) = discover(path)?;
    let git_dir = Dir::open_ambient_dir(&git_path, ambient_authority())?;
    let common_dir = Dir::open_ambient_dir(&common_path, ambient_authority())?;
    let config =
        capture_file(&common_dir, "config", false)?.context("Git configuration is missing")?;
    let worktree = capture_file(&git_dir, "config.worktree", true)?;
    Ok(OriginConfigSnapshot {
        git_dir: git_path.as_os_str().as_encoded_bytes().to_vec(),
        common_dir: common_path.as_os_str().as_encoded_bytes().to_vec(),
        config,
        worktree,
    })
}
impl OriginConfigSnapshot {
    pub(crate) fn local_bytes(&self) -> &[u8] {
        &self.config.bytes
    }
    pub(crate) fn worktree_bytes(&self) -> Option<&[u8]> {
        self.worktree.as_ref().map(|file| file.bytes.as_slice())
    }
    fn added_origin_bytes(&self, url: &str) -> Result<Vec<u8>> {
        ensure!(
            url.starts_with("https://")
                && url
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-._/:".contains(&b)),
            "Invalid publication destination"
        );
        let mut result = self.config.bytes.clone();
        if !result.ends_with(b"\n") {
            result.push(b'\n');
        }
        result.extend_from_slice(format!("[remote \"origin\"]\n\turl = {url}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n").as_bytes());
        Ok(result)
    }
    pub(crate) fn matches_added_origin(&self, after: &Self, url: &str) -> bool {
        self.added_origin_bytes(url).is_ok_and(|expected| {
            self.git_dir == after.git_dir
                && self.common_dir == after.common_dir
                && self.worktree == after.worktree
                && expected == after.config.bytes
                && self.config.mode == after.config.mode
        })
    }
}

fn verify_environment() -> Result<()> {
    for key in [
        "GIT_DIR",
        "GIT_WORK_TREE",
        "GIT_COMMON_DIR",
        "GIT_OBJECT_DIRECTORY",
        "GIT_INDEX_FILE",
        "GIT_CONFIG",
        "GIT_CONFIG_PARAMETERS",
    ] {
        ensure!(
            std::env::var_os(key).is_none_or(|value| value.is_empty()),
            "Git environment overrides must be cleared before publication"
        );
    }
    ensure!(
        std::env::var_os("GIT_CONFIG_COUNT").is_none_or(|value| value.is_empty() || value == "0"),
        "Git environment overrides must be cleared before publication"
    );
    Ok(())
}

#[cfg(unix)]
fn read_external_config(path: &Path, optional: bool) -> Result<Option<Vec<u8>>> {
    use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
    if path == Path::new("/dev/null") {
        return Ok(None);
    }
    ensure!(
        path.is_absolute()
            && !path
                .components()
                .any(|part| matches!(part, std::path::Component::ParentDir)),
        "Cannot safely inspect Git configuration"
    );
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if optional && error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => anyhow::bail!("Cannot safely inspect Git configuration"),
    };
    ensure!(
        metadata.is_file() && !metadata.file_type().is_symlink(),
        "Cannot safely inspect Git configuration"
    );
    for parent in path.ancestors().skip(1) {
        let meta = std::fs::symlink_metadata(parent)
            .map_err(|_| anyhow::anyhow!("Cannot safely inspect Git configuration"))?;
        ensure!(
            meta.is_dir() && !meta.file_type().is_symlink(),
            "Cannot safely inspect Git configuration"
        );
    }
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|_| anyhow::anyhow!("Cannot safely inspect Git configuration"))?;
    let meta = file.metadata()?;
    ensure!(
        meta.is_file()
            && meta.nlink() == 1
            && meta.mode() & 0o022 == 0
            && meta.len() <= 4 * 1024 * 1024,
        "Cannot safely inspect Git configuration"
    );
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(4 * 1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= 4 * 1024 * 1024,
        "Git configuration is too large"
    );
    Ok(Some(bytes))
}
#[cfg(not(unix))]
fn read_external_config(_: &Path, _: bool) -> Result<Option<Vec<u8>>> {
    anyhow::bail!("Git configuration identity cannot be verified on this platform")
}

fn external_configs(repo: &Path) -> Result<Vec<Vec<u8>>> {
    let mut paths = Vec::new();
    if let Some(global) = std::env::var_os("GIT_CONFIG_GLOBAL") {
        let global = PathBuf::from(global);
        paths.push(if global.is_absolute() {
            global
        } else {
            repo.join(global)
        });
    } else {
        let home =
            std::env::var_os("HOME").context("Cannot safely locate global Git configuration")?;
        let home = PathBuf::from(home);
        ensure!(
            home.is_absolute(),
            "Cannot safely locate global Git configuration"
        );
        let xdg = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join(".config"));
        ensure!(
            xdg.is_absolute(),
            "Cannot safely locate global Git configuration"
        );
        paths.push(xdg.join("git/config"));
        paths.push(home.join(".gitconfig"));
    }
    let no_system = std::env::var("GIT_CONFIG_NOSYSTEM")
        .ok()
        .is_some_and(|value| {
            matches!(
                value.to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        });
    if !no_system {
        let system = std::env::var_os("GIT_CONFIG_SYSTEM").context(
            "Set GIT_CONFIG_NOSYSTEM=1 or specify a safe GIT_CONFIG_SYSTEM before publication",
        )?;
        let system = PathBuf::from(system);
        paths.push(if system.is_absolute() {
            system
        } else {
            repo.join(system)
        });
    }
    let mut configs = Vec::new();
    for path in paths {
        if let Some(bytes) = read_external_config(&path, true)? {
            configs.push(bytes);
        }
    }
    Ok(configs)
}

fn reject_includes(bytes: &[u8]) -> Result<()> {
    for entry in bytes.split(|b| *b == 0).filter(|entry| !entry.is_empty()) {
        let key = entry.split(|b| *b == b'\n').next().unwrap_or_default();
        ensure!(
            !(key.starts_with(b"include.") || key.starts_with(b"includeif.")),
            "Git configuration includes must be resolved before publication"
        );
    }
    Ok(())
}

fn inspect_keys(bytes: &[u8]) -> Result<()> {
    for entry in bytes.split(|b| *b == 0).filter(|entry| !entry.is_empty()) {
        let key = entry.split(|b| *b == b'\n').next().unwrap_or_default();
        ensure!(
            !(key.starts_with(b"include.") || key.starts_with(b"includeif.")),
            "Git configuration includes must be resolved before publication"
        );
        ensure!(
            !key.starts_with(b"remote.origin."),
            "Origin configuration already exists"
        );
        ensure!(
            !key.starts_with(b"url."),
            "Git URL rewriting must be resolved before publication"
        );
    }
    Ok(())
}

/// Use Git's parser with includes disabled, never returning private values.
pub(crate) async fn inspect_semantics(
    path: &Path,
    snapshot: &OriginConfigSnapshot,
) -> Result<Vec<u8>> {
    for bytes in std::iter::once(snapshot.local_bytes()).chain(snapshot.worktree_bytes()) {
        let output = crate::process::parse_git_config(bytes.to_vec())
            .await
            .map_err(|_| anyhow::anyhow!("Cannot inspect Git configuration"))?;
        ensure!(output.code == 0, "Cannot inspect Git configuration");
        inspect_keys(&output.stdout)?;
    }
    let output = crate::process::run_git(
        path,
        &crate::args(&["config", "--no-includes", "--null", "--list"]),
        None,
        None,
    )
    .await
    .map_err(|_| anyhow::anyhow!("Cannot inspect Git configuration"))?;
    ensure!(output.code == 0, "Cannot inspect Git configuration");
    inspect_keys(&output.stdout)?;
    Ok(output.stdout)
}

/// Confirm that the new origin is the only effective configuration change.
pub(crate) async fn inspect_added_origin(path: &Path, before: &[u8], url: &str) -> Result<()> {
    let output = crate::process::run_git(
        path,
        &crate::args(&["config", "--no-includes", "--null", "--list"]),
        None,
        None,
    )
    .await
    .map_err(|_| anyhow::anyhow!("Cannot inspect Git configuration"))?;
    ensure!(output.code == 0, "Cannot inspect Git configuration");
    verify_added_entries(before, &output.stdout, url)
}

fn verify_added_entries(before: &[u8], after: &[u8], url: &str) -> Result<()> {
    let mut retained = Vec::new();
    let mut found_url = false;
    let mut found_fetch = false;
    for entry in after.split(|b| *b == 0).filter(|entry| !entry.is_empty()) {
        let (key, value) = match entry.iter().position(|b| *b == b'\n') {
            Some(pos) => (&entry[..pos], &entry[pos + 1..]),
            None => (entry, &[][..]),
        };
        if key.starts_with(b"remote.origin.") {
            if key == b"remote.origin.url" && value == url.as_bytes() && !found_url {
                found_url = true;
            } else if key == b"remote.origin.fetch"
                && value == b"+refs/heads/*:refs/remotes/origin/*"
                && !found_fetch
            {
                found_fetch = true;
            } else {
                anyhow::bail!("Origin configuration changed; inspect publication history");
            }
        } else {
            retained.extend_from_slice(entry);
            retained.push(0);
        }
    }
    ensure!(
        found_url && found_fetch && retained == before,
        "Git configuration changed; inspect publication history"
    );
    Ok(())
}

/// Prove the new section preserves every existing parsed local setting before writing.
pub(crate) async fn validate_candidate(snapshot: &OriginConfigSnapshot, url: &str) -> Result<()> {
    let original = crate::process::parse_git_config(snapshot.local_bytes().to_vec())
        .await
        .map_err(|_| anyhow::anyhow!("Cannot inspect Git configuration"))?;
    let candidate = crate::process::parse_git_config(snapshot.added_origin_bytes(url)?)
        .await
        .map_err(|_| anyhow::anyhow!("Cannot inspect Git configuration"))?;
    ensure!(
        original.code == 0 && candidate.code == 0,
        "Cannot inspect Git configuration"
    );
    inspect_keys(&original.stdout)?;
    verify_added_entries(&original.stdout, &candidate.stdout, url)
        .map_err(|_| anyhow::anyhow!("Adding origin would change existing Git settings"))
}

pub(crate) struct OriginLock {
    directory: Dir,
    file: Option<std::fs::File>,
    active: bool,
}
impl Drop for OriginLock {
    fn drop(&mut self) {
        if self.active && self.entry_matches("config.lock") {
            let _ = self.directory.remove_file("config.lock");
        }
    }
}
impl OriginLock {
    #[cfg(unix)]
    fn entry_matches(&self, name: &str) -> bool {
        use cap_std::fs::OpenOptionsExt;
        use std::os::unix::fs::MetadataExt;
        let Some(file) = &self.file else { return false };
        let Ok(held) = file.metadata() else {
            return false;
        };
        let mut options = OpenOptions::new();
        options
            .read(true)
            .follow(FollowSymlinks::No)
            .custom_flags(libc::O_NONBLOCK);
        let Ok(entry) = self.directory.open_with(name, &options) else {
            return false;
        };
        let Ok(entry) = entry.into_std().metadata() else {
            return false;
        };
        held.is_file()
            && entry.is_file()
            && held.nlink() == 1
            && entry.nlink() == 1
            && held.dev() == entry.dev()
            && held.ino() == entry.ino()
    }
    #[cfg(not(unix))]
    fn entry_matches(&self, _: &str) -> bool {
        false
    }

    pub(crate) fn acquire(path: &Path, expected: &OriginConfigSnapshot) -> Result<Self> {
        let current = capture(path)?;
        ensure!(
            &current == expected,
            "Git configuration changed; review again"
        );
        let common = PathBuf::from(crate::os_from_bytes(&expected.common_dir)?);
        let directory = Dir::open_ambient_dir(common, ambient_authority())?;
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
        let file = directory
            .open_with("config.lock", &options)
            .map_err(|_| anyhow::anyhow!("Cannot lock Git configuration"))?
            .into_std();
        let lock = Self {
            directory,
            file: Some(file),
            active: true,
        };
        ensure!(
            &capture(path)? == expected,
            "Git configuration changed; review again"
        );
        Ok(lock)
    }
    pub(crate) fn commit(
        mut self,
        path: &Path,
        expected: &OriginConfigSnapshot,
        url: &str,
    ) -> Result<()> {
        ensure!(
            &capture(path)? == expected,
            "Git configuration changed; inspect publication history"
        );
        let candidate = expected.added_origin_bytes(url)?;
        let file = self
            .file
            .as_mut()
            .context("Git configuration lock is missing")?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            file.set_permissions(std::fs::Permissions::from_mode(
                expected.config.mode & 0o7777,
            ))?;
        }
        file.write_all(&candidate)?;
        file.sync_all()?;
        ensure!(
            self.entry_matches("config.lock"),
            "Git configuration lock changed; inspect publication history"
        );
        self.directory
            .rename("config.lock", &self.directory, "config")?;
        self.active = false;
        ensure!(
            self.entry_matches("config"),
            "Git configuration changed; inspect publication history"
        );
        ensure!(
            expected.matches_added_origin(&capture(path)?, url),
            "Git configuration changed; inspect publication history"
        );
        self.directory.open(".")?.into_std().sync_all()?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn configuration_guard_rejects_partial_origin_rewrites_and_includes() {
        assert!(inspect_keys(b"core.bare\nfalse\0").is_ok());
        for key in [
            b"remote.origin.pushurl".as_slice(),
            b"url.https://x/.insteadof",
            b"url.https://x/.pushinsteadof",
            b"include.path",
            b"includeif.gitdir:/tmp/.path",
        ] {
            let mut row = key.to_vec();
            row.extend_from_slice(b"\nprivate\0");
            assert!(inspect_keys(&row).is_err());
        }
    }
    #[tokio::test]
    #[cfg(unix)]
    async fn candidate_rejects_trailing_continuation_before_any_write() {
        use std::os::unix::fs::PermissionsExt;
        let base =
            std::env::temp_dir().join(format!("publish-origin-candidate-{}", uuid::Uuid::new_v4()));
        let git = base.join(".git");
        std::fs::create_dir_all(&git).unwrap();
        let original = b"[core]\n\tx = trailing\\";
        std::fs::write(git.join("config"), original).unwrap();
        std::fs::set_permissions(git.join("config"), std::fs::Permissions::from_mode(0o600))
            .unwrap();
        let snapshot = capture(&base).unwrap();
        assert!(
            validate_candidate(&snapshot, "https://github.com/alice/repo.git")
                .await
                .is_err()
        );
        assert_eq!(std::fs::read(git.join("config")).unwrap(), original);
        assert!(!git.join("config.lock").exists());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn atomic_origin_write_preserves_config_and_respects_existing_git_lock() {
        let base =
            std::env::temp_dir().join(format!("publish-origin-write-{}", uuid::Uuid::new_v4()));
        let git = base.join(".git");
        std::fs::create_dir_all(&git).unwrap();
        let original = b"[core]\n\tbare = false\n# preserve this comment\n";
        std::fs::write(git.join("config"), original).unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(git.join("config"), std::fs::Permissions::from_mode(0o600))
            .unwrap();
        let snapshot = capture(&base).unwrap();
        let occupied = git.join("config.lock");
        std::fs::write(&occupied, b"other writer").unwrap();
        assert!(OriginLock::acquire(&base, &snapshot).is_err());
        assert_eq!(std::fs::read(&occupied).unwrap(), b"other writer");
        std::fs::remove_file(&occupied).unwrap();
        OriginLock::acquire(&base, &snapshot)
            .unwrap()
            .commit(&base, &snapshot, "https://github.com/alice/repo.git")
            .unwrap();
        let result = std::fs::read(git.join("config")).unwrap();
        assert!(result.starts_with(original));
        assert!(
            result
                .windows(b"url = https://github.com/alice/repo.git".len())
                .any(|row| row == b"url = https://github.com/alice/repo.git")
        );
        assert!(!occupied.exists());
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    #[cfg(unix)]
    fn preflight_handles_nested_and_linked_worktrees_without_opening_fifo_or_links() {
        use std::{ffi::CString, os::unix::fs::symlink};
        let base = std::env::temp_dir().join(format!("publish-origin-{}", uuid::Uuid::new_v4()));
        let repo = base.join("repo");
        let git = repo.join(".git");
        std::fs::create_dir_all(repo.join("nested")).unwrap();
        std::fs::create_dir(&git).unwrap();
        std::fs::write(git.join("config"), b"[core]\n\tbare = false\n").unwrap();
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(git.join("config"), std::fs::Permissions::from_mode(0o600))
            .unwrap();
        assert!(preflight(&repo.join("nested")).is_ok());
        let linked = base.join("linked");
        let linked_git = git.join("worktrees/wt");
        std::fs::create_dir_all(&linked_git).unwrap();
        std::fs::create_dir(&linked).unwrap();
        std::fs::write(
            linked.join(".git"),
            format!("gitdir: {}\n", linked_git.display()),
        )
        .unwrap();
        std::fs::write(linked_git.join("commondir"), "../..\n").unwrap();
        assert!(preflight(&linked).is_ok());
        let config = git.join("config");
        let outside = base.join("sensitive");
        std::fs::rename(&config, &outside).unwrap();
        symlink(&outside, &config).unwrap();
        assert!(preflight(&repo).is_err() && preflight(&linked).is_err());
        std::fs::remove_file(&config).unwrap();
        match std::fs::hard_link(&outside, &config) {
            Ok(()) => {
                assert!(preflight(&repo).is_err());
                std::fs::remove_file(&config).unwrap();
            }
            Err(error) if matches!(error.raw_os_error(), Some(libc::EACCES | libc::EPERM)) => {}
            Err(error) => panic!("Cannot create hardlink fixture: {error}"),
        }
        let fifo = CString::new(config.as_os_str().as_encoded_bytes()).unwrap();
        assert_eq!(unsafe { libc::mkfifo(fifo.as_ptr(), 0o600) }, 0);
        assert!(preflight(&repo).is_err());
        std::fs::remove_dir_all(base).unwrap();
    }
}
