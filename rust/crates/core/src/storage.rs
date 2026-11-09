//! Shared atomic metadata writes, protected by an automatically released OS lock.
use anyhow::{Context, Result};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    path::Path,
};

pub(crate) fn update<T: Serialize>(
    path: &Path,
    read: impl FnOnce() -> Result<T>,
    change: impl FnOnce(&mut T) -> Result<()>,
) -> Result<T> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let _lock = lock(path)?;
    let mut value = read()?;
    change(&mut value)?;
    let temporary = parent.join(format!(".desktop-{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> Result<()> {
        use std::io::Write;
        let mut file = private_options().create_new(true).open(&temporary)?;
        file.write_all(&serde_json::to_vec_pretty(&value)?)?;
        file.write_all(b"\n")?;
        file.sync_all()?;
        fs::rename(&temporary, path)?;
        #[cfg(unix)]
        fs::File::open(parent)?.sync_all()?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    Ok(value)
}

/// Acquire the same registry lock used by atomic metadata updates.
pub(crate) fn lock(path: &Path) -> Result<fs::File> {
    let parent = path
        .parent()
        .filter(|path| !path.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    fs::create_dir_all(parent)?;
    let lock_path = path.with_extension("lock");
    let lock = private_options()
        .create(true)
        .truncate(false)
        .open(lock_path)?;
    let cancellation = crate::cancellation::Cancellation::current();
    loop {
        cancellation.check()?;
        match lock.try_lock() {
            Ok(()) => break,
            Err(std::fs::TryLockError::WouldBlock) => {
                std::thread::sleep(std::time::Duration::from_millis(10))
            }
            Err(std::fs::TryLockError::Error(error)) => {
                return Err(error).context("lock application metadata");
            }
        }
    }
    cancellation.check()?;
    Ok(lock)
}
fn private_options() -> OpenOptions {
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options
}
