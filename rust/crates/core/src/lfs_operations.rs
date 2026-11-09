//! Explicit LFS configuration, tracking, checkout and network operations.
use crate::{GitPath, LfsInstallScope, Repository, args, process, validate_path, validate_remote};
use anyhow::Result;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{ffi::OsString, path::Path};

fn origin() -> String {
    "origin".to_owned()
}

/// A requested LFS transfer; fetching alone never updates working files.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case", deny_unknown_fields)]
pub enum LfsTransferRequest {
    Fetch {
        #[serde(default = "origin")]
        remote: String,
        #[serde(default)]
        refs: Vec<String>,
        #[serde(default)]
        all: bool,
        #[serde(default)]
        recent: bool,
        #[serde(default)]
        refetch: bool,
        #[serde(default)]
        dry_run: bool,
        include: Option<String>,
        exclude: Option<String>,
    },
    Pull {
        #[serde(default = "origin")]
        remote: String,
        include: Option<String>,
        exclude: Option<String>,
    },
    Push {
        #[serde(default = "origin")]
        remote: String,
        #[serde(default)]
        refs: Vec<String>,
        #[serde(default)]
        all: bool,
        #[serde(default)]
        dry_run: bool,
    },
}

/// Install global filters without requiring a working tree when skip_repo is
/// explicitly selected. Repository-local callers still use Repository::execute.
pub async fn lfs_install(
    path: &Path,
    scope: LfsInstallScope,
    force: bool,
    skip_repo: bool,
    skip_smudge: bool,
) -> Result<Value> {
    let mut command = args(&["lfs", "install"]);
    if matches!(scope, LfsInstallScope::Local) {
        command.push("--local".into());
    }
    if force {
        command.push("--force".into());
    }
    if skip_repo {
        command.push("--skip-repo".into());
    }
    if skip_smudge {
        command.push("--skip-smudge".into());
    }
    let output = process::run_lfs(path, &command).await?;
    if output.code != 0 {
        return Ok(
            json!({"code":output.code,"stdout":"","stderr":"Git LFS configuration was not fully installed. Review existing hooks and filter settings in a terminal; use --force only to replace them intentionally.","error_kind":"configuration"}),
        );
    }
    Ok(serde_json::to_value(output.text())?)
}

/// Probe optional tooling without requiring or discovering a selected project.
pub async fn lfs_tool_status(path: &Path) -> Result<Value> {
    let version = process::run_lfs(path, &args(&["lfs", "version"])).await?;
    if version.code != 0 {
        return Ok(
            json!({"available":false,"version":null,"using_lfs":null,"patterns":[],"files":[],"hint":"Install git-lfs and add it to PATH (Termux: pkg install git-lfs)."}),
        );
    }
    Ok(
        json!({"available":true,"version":String::from_utf8_lossy(&version.stdout).trim(),"using_lfs":null,"patterns":[],"files":[]}),
    )
}

impl Repository {
    pub(crate) async fn lfs_transfer(&self, request: LfsTransferRequest) -> Result<Value> {
        let (remote, references, all) = match &request {
            LfsTransferRequest::Fetch {
                remote, refs, all, ..
            }
            | LfsTransferRequest::Push {
                remote, refs, all, ..
            } => (remote, Some(refs), *all),
            LfsTransferRequest::Pull { remote, .. } => (remote, None, false),
        };
        validate_remote(remote)?;
        let configured = self
            .run(&args(&["remote", "get-url", "--", remote]))
            .await?;
        anyhow::ensure!(
            configured.code == 0,
            "select a configured Git remote before transferring LFS objects"
        );
        let mut commits = Vec::new();
        if let Some(references) = references {
            anyhow::ensure!(references.len() <= 100, "transfer at most 100 refs at once");
            if references.is_empty() && !all {
                commits.push(self.resolve_commit("HEAD").await?);
            }
            for reference in references {
                commits.push(self.resolve_commit(reference).await?);
            }
        }
        let mut command = match &request {
            LfsTransferRequest::Fetch {
                all,
                recent,
                refetch,
                dry_run,
                include,
                exclude,
                ..
            } => {
                anyhow::ensure!(
                    !*all || !*recent && include.is_none() && exclude.is_none(),
                    "LFS fetch --all cannot be combined with recent/include/exclude"
                );
                let mut command = args(&["lfs", "fetch"]);
                if *all {
                    command.push("--all".into());
                }
                if *recent {
                    command.push("--recent".into());
                }
                if *refetch {
                    command.push("--refetch".into());
                }
                if *dry_run {
                    command.push("--dry-run".into());
                }
                filters(&mut command, include, exclude)?;
                command
            }
            LfsTransferRequest::Pull {
                include, exclude, ..
            } => {
                let mut command = args(&["lfs", "pull"]);
                filters(&mut command, include, exclude)?;
                command
            }
            LfsTransferRequest::Push { all, dry_run, .. } => {
                let mut command = args(&["lfs", "push"]);
                if *all {
                    command.push("--all".into());
                }
                if *dry_run {
                    command.push("--dry-run".into());
                }
                command
            }
        };
        // git-lfs parses these options itself. Refs are resolved commit IDs;
        // operands cannot become options or ambiguously resolve as filenames.
        command.extend(args(&["--", remote]));
        command.extend(commits.into_iter().map(OsString::from));
        transfer_output(process::run_lfs(&self.path, &command).await?)
    }

    pub(crate) async fn lfs_checkout(&self, patterns: Vec<GitPath>) -> Result<Value> {
        anyhow::ensure!(
            patterns.len() <= 1000,
            "checkout at most 1000 LFS patterns at once"
        );
        let mut command = args(&["lfs", "checkout", "--"]);
        for pattern in patterns {
            command.push(validate_path(pattern)?);
        }
        transfer_output(process::run_lfs(&self.path, &command).await?)
    }

    pub(crate) async fn lfs_track(
        &self,
        patterns: Vec<String>,
        filename: bool,
        lockable: Option<bool>,
        remove: bool,
    ) -> Result<Value> {
        anyhow::ensure!(
            !patterns.is_empty() && patterns.len() <= 1000,
            "provide between 1 and 1000 tracking patterns"
        );
        // Git LFS rewrites this file itself; reject a checked-in link or
        // special object instead of following it outside the working tree.
        match std::fs::symlink_metadata(self.path.join(".gitattributes")) {
            Ok(metadata) => anyhow::ensure!(
                metadata.is_file() && !metadata.file_type().is_symlink(),
                ".gitattributes must be an ordinary file"
            ),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(error.into()),
        }
        let mut command = args(&["lfs", if remove { "untrack" } else { "track" }]);
        if filename {
            command.push("--filename".into());
        }
        if let Some(lockable) = lockable {
            command.push(
                if lockable {
                    "--lockable"
                } else {
                    "--not-lockable"
                }
                .into(),
            );
        }
        command.push("--".into());
        for pattern in patterns {
            anyhow::ensure!(
                !pattern.is_empty() && !pattern.contains(['\0', '\n', '\r']),
                "tracking patterns must be nonempty single lines"
            );
            anyhow::ensure!(
                !std::path::Path::new(&pattern)
                    .components()
                    .any(|component| matches!(component, std::path::Component::ParentDir)),
                "LFS tracking patterns cannot traverse parent directories"
            );
            command.push(pattern.into());
        }
        transfer_output(process::run_lfs(&self.path, &command).await?)
    }
}

fn filters(
    command: &mut Vec<OsString>,
    include: &Option<String>,
    exclude: &Option<String>,
) -> Result<()> {
    for (flag, value) in [("include", include), ("exclude", exclude)] {
        if let Some(value) = value {
            anyhow::ensure!(
                !value.contains(['\0', '\n', '\r']),
                "LFS include/exclude patterns must be single lines"
            );
            command.push(format!("--{flag}={value}").into());
        }
    }
    Ok(())
}

fn transfer_output(output: process::RawOutput) -> Result<Value> {
    if output.code == 0 {
        return Ok(serde_json::to_value(output.text())?);
    }
    // Network diagnostics may embed endpoint credentials or authorization
    // headers. Never publish them through the browser API; assigned transports
    // also isolate native log storage before lending credentials.
    let diagnostic = String::from_utf8_lossy(&output.stderr).to_ascii_lowercase();
    let (kind, hint) = if [
        "401",
        "403",
        "authentication",
        "authorization",
        "credentials",
        "permission denied",
    ]
    .iter()
    .any(|word| diagnostic.contains(word))
    {
        (
            "authentication",
            "Check Git LFS credentials and remote access, then retry.",
        )
    } else if [
        "unknown flag",
        "unknown shorthand",
        "flag provided but not defined",
    ]
    .iter()
    .any(|word| diagnostic.contains(word))
    {
        (
            "unsupported",
            "Check installed Git/Git LFS versions and the requested options.",
        )
    } else if [
        "connection refused",
        "no such host",
        "could not resolve",
        "network is unreachable",
        "dial tcp",
        "tls",
        "certificate",
    ]
    .iter()
    .any(|word| diagnostic.contains(word))
    {
        (
            "network",
            "Check network access and the remote endpoint, then retry.",
        )
    } else {
        (
            "failed",
            "Check the remote, object availability, and Git LFS configuration.",
        )
    };
    let details = if crate::git_credentials::logs_isolated() {
        "No transfer log was retained for this operation."
    } else {
        "Run git lfs logs last in a terminal for details."
    };
    Ok(
        json!({"code":output.code,"stdout":"","stderr":format!("Git LFS operation failed. Some objects or files may have changed. {hint} {details}"),"error_kind":kind}),
    )
}
