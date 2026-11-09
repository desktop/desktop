//! Reviewed, local-only creation of the verified GitHub fork parent's remote.
use super::{Identity, RepositoryContext, hash};
use crate::{Repository, args, process};
use anyhow::{Context, Result};
use serde_json::{Value, json};

const REMOTE: &str = "upstream";
const FETCH: &[u8] = b"+refs/heads/*:refs/remotes/upstream/*";

#[derive(Clone, Copy, PartialEq, Eq)]
enum Status {
    Add,
    AlreadyConfigured,
    Blocked,
    NotFork,
}
impl Status {
    fn name(self) -> &'static str {
        match self {
            Self::Add => "add",
            Self::AlreadyConfigured => "already_configured",
            Self::Blocked => "blocked",
            Self::NotFork => "not_fork",
        }
    }
}
struct Configuration {
    bytes: Vec<u8>,
    occupied: bool,
}
struct Plan {
    basis: String,
    status: Status,
    parent: Option<Identity>,
    url: Option<String>,
    reason: Option<&'static str>,
    context: RepositoryContext,
}
impl Plan {
    fn view(&self) -> Value {
        json!({"basis":self.basis,"status":self.status.name(),"remote":REMOTE,"url":self.url,"parent":self.parent,"reason":self.reason})
    }
}
impl Repository {
    async fn upstream_configuration(&self) -> Result<Configuration> {
        // Keep scope, origin, repeated values, valueless settings and all URL
        // rewrites in the certificate. None of this private output is exposed.
        let output = self
            .run(&args(&[
                "config",
                "--null",
                "--includes",
                "--show-origin",
                "--show-scope",
                "--get-regexp",
                r"^(remote\.upstream\.|url\.)",
            ]))
            .await?;
        anyhow::ensure!(
            matches!(output.code, 0 | 1),
            "Cannot inspect upstream setup configuration"
        );
        let mut occupied = false;
        let mut bytes = Vec::new();
        if !output.stdout.is_empty() {
            let fields = output
                .stdout
                .strip_suffix(&[0])
                .context("Invalid upstream setup configuration delimiters")?
                .split(|byte| *byte == 0)
                .collect::<Vec<_>>();
            anyhow::ensure!(
                fields.len().is_multiple_of(3),
                "Invalid scoped upstream setup configuration"
            );
            for row in fields.as_chunks::<3>().0 {
                let key = row[2]
                    .split(|byte| *byte == b'\n')
                    .next()
                    .unwrap_or_default();
                let target = key
                    .iter()
                    .rposition(|byte| *byte == b'.')
                    .is_some_and(|at| &key[..at] == b"remote.upstream");
                occupied |= target;
                if target || key.starts_with(b"url.") {
                    for field in row {
                        bytes.extend_from_slice(field);
                        bytes.push(0);
                    }
                }
            }
        }
        Ok(Configuration { bytes, occupied })
    }
    async fn upstream_url_identity(&self, url: &str) -> Result<Option<Identity>> {
        // --get-url applies native insteadOf rules without opening a transport.
        // URLs and diagnostics can contain credentials, so return identity only.
        let output = process::run_checkout(
            &self.path,
            &args(&[
                "-c",
                "transfer.credentialsInUrl=allow",
                "ls-remote",
                "--get-url",
                "--",
                url,
            ]),
        )
        .await?;
        anyhow::ensure!(output.code == 0, "Cannot inspect upstream URL rewriting");
        let bytes = output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout);
        Ok(std::str::from_utf8(bytes)
            .ok()
            .and_then(|value| Identity::from_url(value).ok()))
    }
    async fn upstream_setup_plan(&self) -> Result<Plan> {
        let context = self.branch_context().await?.view;
        let configuration = self.upstream_configuration().await?;
        let parent = context
            .repository
            .as_ref()
            .and_then(|repository| repository.parent.clone());
        let url = parent.as_ref().map(|parent| {
            format!(
                "https://{}/{}/{}.git",
                parent.host, parent.owner, parent.name
            )
        });
        let (status, reason) = if context.status != "verified" {
            (
                Status::Blocked,
                Some("Refresh verified GitHub repository metadata before setting up upstream"),
            )
        } else if parent.is_none() {
            (Status::NotFork, None)
        } else if configuration.occupied {
            let identity = self
                .fetch_binding(Some(REMOTE.into()))
                .await
                .ok()
                .and_then(|binding| binding.identity);
            if identity.as_ref() == parent.as_ref() {
                (Status::AlreadyConfigured, None)
            } else {
                (
                    Status::Blocked,
                    Some(
                        "The upstream remote name is already configured for another destination or has no usable fetch URL",
                    ),
                )
            }
        } else if self
            .upstream_url_identity(url.as_deref().context("Missing verified upstream URL")?)
            .await?
            .as_ref()
            != parent.as_ref()
        {
            (
                Status::Blocked,
                Some("Native URL rewriting would direct upstream to another repository"),
            )
        } else {
            (Status::Add, None)
        };
        let basis = hash(&(
            &context.basis,
            &configuration.bytes,
            status.name(),
            &parent,
            &url,
        ))?;
        Ok(Plan {
            basis,
            status,
            parent,
            url,
            reason,
            context,
        })
    }
    pub(crate) async fn upstream_setup_preview(&self) -> Result<Value> {
        Ok(self.upstream_setup_plan().await?.view())
    }
    pub(crate) async fn setup_upstream(&self, basis: Option<&str>) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        self.ensure_upstream_locked(basis).await
    }
    /// Called with the common stash lock already held, including after refresh.
    pub(crate) async fn ensure_upstream_locked(&self, basis: Option<&str>) -> Result<Value> {
        let plan = self.upstream_setup_plan().await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                plan.basis == basis,
                "Upstream setup review changed; load it again before retrying"
            );
        }
        anyhow::ensure!(
            plan.status != Status::Blocked,
            "{}",
            plan.reason.unwrap_or("Upstream setup is unavailable")
        );
        if plan.status != Status::Add {
            return Ok(json!({"code":0,"status":plan.status.name(),"context":plan.context}));
        }
        // Rebind immediately before native mutation. The application lock does
        // not reserve configuration against independent Git/file writers.
        let fresh = self.upstream_setup_plan().await?;
        anyhow::ensure!(
            fresh.basis == plan.basis && fresh.status == Status::Add,
            "Upstream setup configuration changed; load the review again"
        );
        let parent = plan
            .parent
            .as_ref()
            .context("Missing verified fork parent")?;
        let url = plan
            .url
            .as_deref()
            .context("Missing verified upstream URL")?;
        let output =
            process::run_checkout(&self.path, &args(&["remote", "add", "--", REMOTE, url])).await?;
        anyhow::ensure!(
            output.code == 0,
            "Native upstream remote creation did not complete; inspect repository remotes before retrying"
        );
        let binding = self.fetch_binding(Some(REMOTE.into())).await?;
        anyhow::ensure!(
            binding.identity.as_ref() == Some(parent),
            "The effective upstream destination changed during setup; inspect repository remotes before retrying"
        );
        let fetch = self
            .run(&args(&[
                "config",
                "--null",
                "--includes",
                "--get-all",
                "remote.upstream.fetch",
            ]))
            .await?;
        anyhow::ensure!(
            fetch.code == 0 && fetch.stdout.strip_suffix(&[0]) == Some(FETCH),
            "The upstream fetch mapping changed during setup; inspect repository remotes before retrying"
        );
        let context = self.branch_context().await?.view;
        anyhow::ensure!(
            context.status == "verified"
                && context
                    .repository
                    .as_ref()
                    .and_then(|repository| repository.parent.as_ref())
                    == Some(parent),
            "The verified fork association changed during upstream setup; inspect repository context before retrying"
        );
        Ok(json!({"code":0,"status":"added","context":context}))
    }
}
