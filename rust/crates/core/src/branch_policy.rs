//! Local default-branch inference and shared branch action permissions.
use crate::{Repository, args};
use anyhow::{Context, Result};
use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, Serialize)]
pub struct DefaultBranch {
    pub name: String,
    pub reference: String,
    pub local: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct BranchPermissions {
    pub name: String,
    pub reference: String,
    pub is_default: bool,
    pub published: bool,
    pub can_delete: bool,
    pub can_rename: bool,
    pub delete_reason: Option<String>,
    pub rename_reason: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct BranchPolicy {
    pub repository_context: crate::RepositoryContext,
    pub default_remote: Option<String>,
    pub remote_head: Option<String>,
    pub default_name: String,
    pub source: &'static str,
    pub default_branch: Option<DefaultBranch>,
    pub branches: Vec<BranchPermissions>,
}
impl BranchPolicy {
    pub(crate) fn branch(&self, name: &str) -> Option<&BranchPermissions> {
        self.branches.iter().find(|branch| branch.name == name)
    }
    pub(crate) fn ensure_delete(&self, name: &str) -> Result<()> {
        let branch = self.branch(name).context("Local branch does not exist")?;
        anyhow::ensure!(
            branch.can_delete,
            "{}",
            branch
                .delete_reason
                .as_deref()
                .unwrap_or("Branch deletion is unavailable")
        );
        Ok(())
    }
    pub(crate) fn ensure_rename(&self, name: &str) -> Result<()> {
        let branch = self.branch(name).context("Local branch does not exist")?;
        anyhow::ensure!(
            branch.can_rename,
            "{}",
            branch
                .rename_reason
                .as_deref()
                .unwrap_or("Branch rename is unavailable")
        );
        Ok(())
    }
}
impl Repository {
    pub(crate) async fn branch_policy(&self) -> Result<BranchPolicy> {
        self.branch_policy_for(&self.branch_list().await?).await
    }
    pub(crate) async fn branch_policy_for(&self, branches: &Value) -> Result<BranchPolicy> {
        let context = self.branch_context().await?;
        let default_remote = context.remote;
        let remote_head = if let Some(remote) = &default_remote
            && context.inspect_head
        {
            let prefix = format!("refs/remotes/{remote}/");
            let output = self
                .run(&args(&[
                    "symbolic-ref",
                    "--quiet",
                    &format!("{prefix}HEAD"),
                ]))
                .await?;
            // Desktop treats missing or broken cached symbolic refs as an
            // unavailable remote HEAD and uses its normal default fallback.
            anyhow::ensure!(
                matches!(output.code, 0 | 1 | 128),
                "Cannot inspect default remote HEAD: {}",
                output.text().stderr
            );
            if output.code == 0 {
                let reference = std::str::from_utf8(&output.stdout)?.trim_end_matches('\n');
                // An unrelated symbolic target is not this remote's default.
                // Match Desktop's getRemoteHEAD fallback instead of making
                // ordinary snapshots unavailable because of cached metadata.
                reference
                    .strip_prefix(&prefix)
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
            } else {
                None
            }
        } else {
            None
        };
        let (default_name, source) = if let Some(name) = &remote_head {
            (name.clone(), "remote_head")
        } else {
            // Match Desktop's global initialization preference, not a local
            // repository override of the same setting. No network or writes.
            let output = self
                .run(&args(&[
                    "config",
                    "--global",
                    "--null",
                    "--get",
                    "init.defaultBranch",
                ]))
                .await?;
            anyhow::ensure!(
                matches!(output.code, 0 | 1),
                "Cannot inspect global default branch: {}",
                output.text().stderr
            );
            if output.code == 0 {
                (
                    String::from_utf8(
                        output
                            .stdout
                            .strip_suffix(&[0])
                            .context("Missing default branch delimiter")?
                            .to_vec(),
                    )?,
                    "global_init",
                )
            } else {
                ("main".into(), "main")
            }
        };
        let remote_ref = remote_head
            .as_ref()
            .zip(default_remote.as_ref())
            .map(|(name, remote)| format!("refs/remotes/{remote}/{name}"));
        let branches = branches.as_array().context("Invalid branch list")?;
        let mut local_hit = None;
        let mut tracking_hit = None;
        let mut remote_hit = None;
        for branch in branches {
            if branch["local"] == true {
                if branch["name"] == default_name {
                    local_hit = Some(branch);
                }
                if remote_ref
                    .as_deref()
                    .is_some_and(|reference| branch["upstream"] == reference)
                    && (tracking_hit.is_none() || branch["name"] == default_name)
                {
                    tracking_hit = Some(branch);
                }
            } else if remote_ref
                .as_deref()
                .is_some_and(|reference| branch["ref"] == reference)
            {
                remote_hit = Some(branch);
            }
        }
        let default_branch = tracking_hit
            .or(local_hit)
            .or(remote_hit)
            .map(|branch| -> Result<DefaultBranch> {
                Ok(DefaultBranch {
                    name: branch["name"]
                        .as_str()
                        .context("Missing default branch name")?
                        .into(),
                    reference: branch["ref"]
                        .as_str()
                        .context("Missing default branch ref")?
                        .into(),
                    local: branch["local"] == true,
                })
            })
            .transpose()?;
        let mut permissions = Vec::new();
        for branch in branches.iter().filter(|branch| branch["local"] == true) {
            let name = branch["name"]
                .as_str()
                .context("Missing local branch name")?;
            let reference = branch["ref"].as_str().context("Missing local branch ref")?;
            let is_default = default_branch
                .as_ref()
                .is_some_and(|default| default.local && default.reference == reference);
            // Desktop regards a configured upstream as published, including
            // a gone tracking tip; do not infer this from remote existence.
            let published = branch["upstream"]
                .as_str()
                .is_some_and(|upstream| !upstream.is_empty());
            permissions.push(BranchPermissions {
                name: name.into(),
                reference: reference.into(),
                is_default,
                published,
                can_delete: !is_default,
                can_rename: !is_default || !published,
                delete_reason: is_default
                    .then(|| "The detected default branch cannot be deleted".into()),
                rename_reason: (is_default && published)
                    .then(|| "The published default branch cannot be renamed".into()),
            });
        }
        Ok(BranchPolicy {
            repository_context: context.view,
            default_remote,
            remote_head,
            default_name,
            source,
            default_branch,
            branches: permissions,
        })
    }
    pub(crate) async fn branch_list_with_policy(&self) -> Result<Value> {
        let mut branches = self.branch_list().await?;
        let policy = self.branch_policy_for(&branches).await?;
        for branch in branches.as_array_mut().context("Invalid branch list")? {
            if let Some(permission) = branch["name"]
                .as_str()
                .and_then(|name| policy.branch(name))
                .filter(|_| branch["local"] == true)
            {
                branch["policy"] = serde_json::to_value(permission)?;
            }
        }
        Ok(branches)
    }
}
