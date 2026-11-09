//! Operation-owned LFS storage keeps native objects while preventing raw logs.
//!
//! The alias lives beside the canonical media directory so native LFS renames
//! remain on one filesystem. Only `objects` is shared: incomplete downloads,
//! temporary files, bad objects and lock caches are operation-local. Resuming
//! incomplete transfers and retaining lock caches across operations are therefore
//! unavailable in this first isolated version. No credential is written here.
use crate::{Repository, args, cancellation, process};
use anyhow::{Result, anyhow, ensure};
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
};

const STORAGE_ERROR: &str = "Cannot isolate Git LFS logs safely for the assigned GitHub account";
const PATH_ERROR: &str =
    "Assigned GitHub credentials require supported Unicode Git LFS storage paths";

pub(crate) struct Storage {
    alias: PathBuf,
    configuration: Vec<(String, String)>,
}

impl Storage {
    /// This tokenless include applies only to the exact selected Git directory,
    /// including a linked worktree's real Git directory, never its submodules.
    pub(crate) fn config(&self) -> Vec<(String, String)> {
        self.configuration.clone()
    }
}

impl Drop for Storage {
    fn drop(&mut self) {
        // remove_dir_all does not follow the objects directory symlink. The
        // caller must retain Storage until native processes and hooks stop.
        let _ = fs::remove_dir_all(&self.alias);
    }
}

/// Prepare before entering the task-local credential scope. Missing LFS needs
/// no alias; discovery failures must not silently permit unisolated execution.
pub(crate) async fn prepare(repo: &Repository) -> Result<Option<Storage>> {
    let cancellation = cancellation::Cancellation::current();
    cancellation.check()?;
    // Ask Git itself to discover external commands and aliases instead of
    // interpreting localized "not a git command" diagnostics or guessing PATH.
    let discovery = process::run(repo.path(), &args(&["--list-cmds=others,alias"])).await;
    cancellation.check()?;
    let discovery = discovery.map_err(|_| anyhow!(STORAGE_ERROR))?;
    ensure!(discovery.code == 0, STORAGE_ERROR);
    if !discovery
        .stdout
        .split(|byte| *byte == b'\n')
        .any(|name| name == b"lfs")
    {
        return Ok(None);
    }
    let media = repo.lfs_media_directory().await;
    cancellation.check()?;
    let media = media.map_err(|_| anyhow!(STORAGE_ERROR))?;
    let gitdir = repo.git_directory().await;
    cancellation.check()?;
    let gitdir = gitdir.map_err(|_| anyhow!(STORAGE_ERROR))?;
    cancellation::blocking(move || create(&media, &gitdir))
        .await
        .map(Some)
}

fn create(media: &Path, gitdir: &Path) -> Result<Storage> {
    fs::create_dir_all(media).map_err(|_| anyhow!(STORAGE_ERROR))?;
    let media = media.canonicalize().map_err(|_| anyhow!(STORAGE_ERROR))?;
    ensure!(media.is_dir(), STORAGE_ERROR);
    let gitdir = gitdir.canonicalize().map_err(|_| anyhow!(STORAGE_ERROR))?;
    let key = gitdir_key(&path_text(&gitdir)?, cfg!(windows))?;
    let parent = media.parent().ok_or_else(|| anyhow!(STORAGE_ERROR))?;
    let mut storage = Storage {
        alias: private_directory(parent)?,
        configuration: Vec::new(),
    };
    directory_link(&media, &storage.alias.join("objects"))?;
    // A regular file works on Unix and Windows and prevents both timestamped
    // panic logs and logs/http statistics from ever being created below it.
    private_file(&storage.alias.join("logs"))?;
    let include = storage.alias.join("storage.config");
    let alias = path_text(&storage.alias)?;
    let include_text = path_text(&include)?;
    let mut file = private_file(&include)?;
    file.write_all(format!("[lfs]\n\tstorage = {}\n", config_value(&alias)?).as_bytes())
        .map_err(|_| anyhow!(STORAGE_ERROR))?;
    storage.configuration.push((key, include_text));
    cancellation::Cancellation::current().check()?;
    Ok(storage)
}

fn private_directory(parent: &Path) -> Result<PathBuf> {
    for _ in 0..8 {
        let path = parent.join(format!(".desktop-lfs-{}", uuid::Uuid::new_v4()));
        let builder = fs::DirBuilder::new();
        #[cfg(unix)]
        let builder = {
            use std::os::unix::fs::DirBuilderExt;
            let mut builder = builder;
            builder.mode(0o700);
            builder
        };
        match builder.create(&path) {
            Ok(()) => return Ok(path),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(_) => return Err(anyhow!(STORAGE_ERROR)),
        }
    }
    Err(anyhow!(STORAGE_ERROR))
}

fn private_file(path: &Path) -> Result<fs::File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path).map_err(|_| anyhow!(STORAGE_ERROR))
}

#[cfg(unix)]
fn directory_link(original: &Path, link: &Path) -> Result<()> {
    std::os::unix::fs::symlink(original, link).map_err(|_| anyhow!(STORAGE_ERROR))
}

#[cfg(windows)]
fn directory_link(original: &Path, link: &Path) -> Result<()> {
    // Directory hard links cannot replace a symlink. Fail before credential
    // release if Windows policy does not permit creating a directory symlink.
    std::os::windows::fs::symlink_dir(original, link).map_err(|_| anyhow!(STORAGE_ERROR))
}

#[cfg(not(any(unix, windows)))]
fn directory_link(_original: &Path, _link: &Path) -> Result<()> {
    Err(anyhow!(STORAGE_ERROR))
}

fn path_text(path: &Path) -> Result<String> {
    let text = path.to_str().ok_or_else(|| anyhow!(PATH_ERROR))?;
    ensure!(
        path.is_absolute() && !text.chars().any(char::is_control),
        PATH_ERROR
    );
    Ok(text.to_owned())
}

fn gitdir_key(value: &str, windows: bool) -> Result<String> {
    ensure!(
        !value.is_empty() && !value.chars().any(char::is_control),
        PATH_ERROR
    );
    let value = if windows {
        let value = value.strip_prefix(r"\\?\").unwrap_or(value);
        let value = value.replace('\\', "/");
        if let Some(unc) = value.strip_prefix("UNC/") {
            format!("//{unc}")
        } else {
            value
        }
    } else {
        value.to_owned()
    };
    // A trailing slash would implicitly append ** and include child Git dirs.
    let value = value.trim_end_matches('/');
    ensure!(!value.is_empty(), PATH_ERROR);
    let mut literal = String::with_capacity(value.len());
    for character in value.chars() {
        if matches!(character, '*' | '?' | '[' | ']' | '\\') {
            literal.push('\\');
        }
        literal.push(character);
    }
    let condition = if windows { "gitdir/i" } else { "gitdir" };
    Ok(format!("includeIf.{condition}:{literal}.path"))
}

fn config_value(value: &str) -> Result<String> {
    ensure!(!value.chars().any(char::is_control), PATH_ERROR);
    Ok(format!(
        "\"{}\"",
        value.replace('\\', "\\\\").replace('"', "\\\"")
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exact_gitdir_patterns_escape_globs_and_never_add_a_descendant_suffix() {
        assert_eq!(
            gitdir_key("/cache/repo[one]*?/back\\slash/.git/", false).unwrap(),
            "includeIf.gitdir:/cache/repo\\[one\\]\\*\\?/back\\\\slash/.git.path"
        );
        assert_eq!(
            gitdir_key(r"\\?\C:\work\Repo[one]\.git", true).unwrap(),
            "includeIf.gitdir/i:C:/work/Repo\\[one\\]/.git.path"
        );
        assert_eq!(
            gitdir_key(r"\\?\UNC\server\share\repo\.git", true).unwrap(),
            "includeIf.gitdir/i://server/share/repo/.git.path"
        );
        for value in ["", "/private\nvalue/.git", "/private\0value/.git"] {
            let error = gitdir_key(value, false).unwrap_err();
            assert_eq!(error.to_string(), PATH_ERROR);
            assert!(!format!("{error:?}").contains("private"));
        }
        assert_eq!(
            config_value("/cache/a \"quote\"\\path").unwrap(),
            "\"/cache/a \\\"quote\\\"\\\\path\""
        );
    }

    #[test]
    fn storage_cleanup_preserves_canonical_objects_and_never_creates_a_log_directory() {
        let root =
            std::env::temp_dir().join(format!("desktop-lfs-storage-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&root).unwrap();
        let media = root.join("canonical objects");
        let gitdir = root.join("actual.git");
        fs::create_dir(&gitdir).unwrap();
        #[cfg(windows)]
        let storage = match create(&media, &gitdir) {
            Ok(storage) => storage,
            Err(error) => {
                // Developer Mode / symlink privileges are optional. Production
                // must refuse safely when this platform cannot create the alias.
                assert_eq!(error.to_string(), STORAGE_ERROR);
                fs::remove_dir_all(root).unwrap();
                return;
            }
        };
        #[cfg(not(windows))]
        let storage = create(&media, &gitdir).unwrap();
        let alias = storage.alias.clone();
        assert_eq!(
            fs::canonicalize(alias.join("objects")).unwrap(),
            fs::canonicalize(&media).unwrap()
        );
        assert!(fs::metadata(alias.join("logs")).unwrap().is_file());
        assert_eq!(fs::metadata(alias.join("logs")).unwrap().len(), 0);
        assert!(fs::create_dir(alias.join("logs/http")).is_err());
        let content = fs::read_to_string(alias.join("storage.config")).unwrap();
        assert!(content.starts_with("[lfs]\n\tstorage = \""));
        assert!(!content.contains("password"));
        assert!(!content.contains("credential"));
        fs::write(alias.join("objects/payload"), b"canonical payload").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            assert_eq!(
                fs::metadata(&alias).unwrap().permissions().mode() & 0o777,
                0o700
            );
            assert_eq!(
                fs::metadata(alias.join("logs"))
                    .unwrap()
                    .permissions()
                    .mode()
                    & 0o777,
                0o600
            );
        }
        drop(storage);
        assert!(!alias.exists());
        assert_eq!(
            fs::read(media.join("payload")).unwrap(),
            b"canonical payload"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn unsupported_native_byte_paths_fail_without_echoing_bytes() {
        use std::os::unix::ffi::OsStrExt;
        let path = Path::new(std::ffi::OsStr::from_bytes(b"/private-\xff/.git"));
        let error = path_text(path).unwrap_err();
        assert_eq!(error.to_string(), PATH_ERROR);
        assert!(!format!("{error:?}").contains("private"));
    }
}
