//! Cooperative request cancellation shared by transports, commands, and metadata locks.
use anyhow::Result;
use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
};
use tokio::sync::watch;

pub const CANCELLED: &str =
    "Operation cancelled; inspect repository state before retrying a mutation";

#[derive(Clone)]
pub struct Cancellation(watch::Sender<bool>, Arc<AtomicBool>);

impl Default for Cancellation {
    fn default() -> Self {
        Self(watch::channel(false).0, Arc::new(AtomicBool::new(false)))
    }
}

tokio::task_local! { static CURRENT: Cancellation; }

impl Cancellation {
    pub fn current() -> Self {
        CURRENT.try_with(Clone::clone).unwrap_or_default()
    }

    /// Recovery guidance for this request, including an uncertain API mutation.
    pub fn message(&self) -> &'static str {
        if self.remote_mutation_started() {
            "Operation cancelled; inspect GitHub before retrying: the remote mutation may have completed"
        } else {
            CANCELLED
        }
    }

    pub(crate) fn remote_mutation_started(&self) -> bool {
        self.1.load(Ordering::Acquire)
    }

    pub(crate) fn mark_remote_mutation(&self) {
        self.1.store(true, Ordering::Release);
    }

    pub fn cancel(&self) {
        self.0.send_replace(true);
    }

    pub fn is_cancelled(&self) -> bool {
        *self.0.borrow()
    }

    pub fn check(&self) -> Result<()> {
        anyhow::ensure!(!self.is_cancelled(), self.message());
        Ok(())
    }

    pub async fn cancelled(&self) {
        let mut receiver = self.0.subscribe();
        let _ = receiver.wait_for(|cancelled| *cancelled).await;
    }

    pub async fn scope<F: Future>(self, operation: F) -> F::Output {
        CURRENT.scope(self, operation).await
    }
}

/// Propagate request cancellation into filesystem work, including OS-lock waits.
pub async fn blocking<T: Send + 'static>(
    operation: impl FnOnce() -> Result<T> + Send + 'static,
) -> Result<T> {
    let cancellation = Cancellation::current();
    tokio::task::spawn_blocking(move || {
        cancellation.check()?;
        CURRENT.sync_scope(cancellation, operation)
    })
    .await?
}

/// Cancel a side-effect-free wait such as acquiring an operation mutex.
pub async fn wait<F: Future>(future: F) -> Result<F::Output> {
    let cancellation = Cancellation::current();
    tokio::select! {
        biased;
        _ = cancellation.cancelled() => Err(anyhow::anyhow!(cancellation.message())),
        value = future => Ok(value),
    }
}

/// Install process termination handlers before starting isolated command groups.
pub struct ShutdownSignal {
    #[cfg(unix)]
    interrupt: tokio::signal::unix::Signal,
    #[cfg(unix)]
    terminate: tokio::signal::unix::Signal,
}
impl ShutdownSignal {
    pub fn new() -> std::io::Result<Self> {
        Ok(Self {
            #[cfg(unix)]
            interrupt: tokio::signal::unix::signal(tokio::signal::unix::SignalKind::interrupt())?,
            #[cfg(unix)]
            terminate: tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?,
        })
    }
    pub async fn received(&mut self) -> std::io::Result<u8> {
        #[cfg(unix)]
        {
            let (code, value) = tokio::select! {
                value = self.interrupt.recv() => (130, value),
                value = self.terminate.recv() => (143, value),
            };
            value.ok_or_else(|| std::io::Error::other("signal stream closed"))?;
            Ok(code)
        }
        #[cfg(not(unix))]
        {
            tokio::signal::ctrl_c().await?;
            Ok(130)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[tokio::test]
    async fn cancellation_interrupts_a_metadata_lock_wait_without_overwriting_data() {
        let directory =
            std::env::temp_dir().join(format!("desktop-cancel-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&directory).unwrap();
        let path = directory.join("repositories.json");
        let registry = crate::Registry::new(path.clone());
        registry.add(directory.clone(), true).unwrap();
        let original = std::fs::read(&path).unwrap();
        let lock = std::fs::OpenOptions::new()
            .read(true)
            .write(true)
            .open(path.with_extension("lock"))
            .unwrap();
        lock.lock().unwrap();
        let token = Cancellation::default();
        let work_token = token.clone();
        let job = tokio::spawn(
            work_token.scope(async move { blocking(move || registry.forget(&directory)).await }),
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
        token.cancel();
        let result = tokio::time::timeout(Duration::from_secs(1), job)
            .await
            .unwrap()
            .unwrap();
        assert!(matches!(result, Err(error) if error.to_string().contains("cancelled")));
        assert_eq!(std::fs::read(&path).unwrap(), original);
        drop(lock);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[tokio::test]
    async fn cancellation_interrupts_mutex_wait_and_stays_within_its_scope() {
        let mutex = std::sync::Arc::new(tokio::sync::Mutex::new(()));
        let guard = mutex.lock().await;
        let token = Cancellation::default();
        token.cancel();
        let result = token.scope(wait(mutex.lock())).await;
        assert!(result.is_err());
        drop(guard);
        assert!(!Cancellation::current().is_cancelled());
        assert!(wait(mutex.lock()).await.is_ok());
    }
}
