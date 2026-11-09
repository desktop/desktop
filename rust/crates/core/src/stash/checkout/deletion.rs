//! Reviewed local branch deletion, native Git guards and retained tip/config recovery.
use super::{Plan as CheckoutPlan, ensure_checkout};
use crate::stash::remote_deletion::{Plan as RemotePlan, Prepared as PreparedRemote};
use crate::{ChangesStrategy, Repository, args, discard_fs as work, process};
use anyhow::{Context, Result};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub(crate) struct DeletionRequest {
    pub(crate) to_checkout: Option<String>,
    pub(crate) force: bool,
    pub(crate) strategy: ChangesStrategy,
    pub(crate) basis: Option<String>,
    pub(crate) replace_stash: bool,
    pub(crate) restore_index: bool,
    pub(crate) upstream: Option<crate::UpstreamDeletion>,
}
#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct Setting {
    key: String,
    value: Vec<u8>,
}
struct Plan {
    view: Value,
    name: String,
    oid: String,
    config: Vec<Setting>,
    checkout: Option<CheckoutPlan>,
    local_basis: String,
    upstream: Option<(crate::RemoteBranchDeletion, RemotePlan)>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u8,
    id: String,
    repository_id: String,
    created_ns: u128,
    name: String,
    oid: String,
    backup_ref: String,
    config: Vec<Setting>,
    checkout_receipt_id: Option<String>,
    #[serde(default)]
    remote_deletion_receipt_id: Option<String>,
    phase: String,
    restored_as: Option<String>,
    error: Option<String>,
}
fn valid_id(id: &str) -> Result<()> {
    anyhow::ensure!(
        uuid::Uuid::parse_str(id)?.to_string() == id,
        "invalid branch deletion receipt ID"
    );
    Ok(())
}
fn directory(path: &Path, create: bool) -> Result<bool> {
    if create {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(path)?;
    }
    match fs::symlink_metadata(path) {
        Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.into()),
        Ok(metadata) => anyhow::ensure!(
            metadata.is_dir() && !metadata.file_type().is_symlink(),
            "branch deletion directory cannot be a symlink"
        ),
    }
    Ok(true)
}
fn read(base: &Path, id: &str, owner: &str) -> Result<Receipt> {
    valid_id(id)?;
    directory(base, false)?;
    let directory = Dir::open_ambient_dir(base, ambient_authority())?;
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = directory.open_with(format!("{id}.json"), &options)?;
    anyhow::ensure!(
        file.metadata()?.is_file(),
        "branch deletion receipt must be a regular file"
    );
    let mut bytes = Vec::new();
    file.by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= 1024 * 1024,
        "branch deletion receipt exceeds supported size"
    );
    let receipt: Receipt = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(
        receipt.version == 1 && receipt.id == id && receipt.repository_id == owner,
        "unsupported or foreign branch deletion receipt"
    );
    anyhow::ensure!(
        receipt.backup_ref == format!("refs/desktop/deleted-branches/{id}"),
        "invalid branch recovery ref"
    );
    if let Some(id) = &receipt.remote_deletion_receipt_id {
        valid_id(id)?;
    }
    super::super::oid(&receipt.oid)?;
    Ok(receipt)
}
async fn write(base: &Path, receipt: &Receipt) -> Result<()> {
    let base = base.to_owned();
    let receipt = receipt.clone();
    // Record completed/uncertain native mutations even after cancellation.
    tokio::task::spawn_blocking(move || {
        directory(&base, false)?;
        let bytes = serde_json::to_vec_pretty(&receipt)?;
        anyhow::ensure!(
            bytes.len() <= 1024 * 1024,
            "branch deletion receipt exceeds supported size"
        );
        let temporary = base.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
        work::private_write(&temporary, &bytes)?;
        let result = fs::rename(&temporary, base.join(format!("{}.json", receipt.id)));
        if result.is_err() {
            let _ = fs::remove_file(&temporary);
        }
        result?;
        #[cfg(unix)]
        fs::File::open(base)?.sync_all()?;
        Ok(())
    })
    .await?
}
fn quote(bytes: &[u8]) -> Vec<u8> {
    let mut result = vec![b'\''];
    for byte in bytes {
        if *byte == b'\'' {
            result.extend_from_slice(b"'\\''");
        } else {
            result.push(*byte);
        }
    }
    result.push(b'\'');
    result
}
impl Repository {
    async fn deletion_directory(&self) -> Result<PathBuf> {
        Ok(self.git_directory().await?.join("desktop-branch-deletions"))
    }
    async fn deletion_ref(&self, reference: &str) -> Result<Option<String>> {
        let exists = self
            .run(&args(&["show-ref", "--verify", "--quiet", reference]))
            .await?;
        anyhow::ensure!(
            matches!(exists.code, 0 | 1),
            "cannot inspect deletion/recovery ref"
        );
        if exists.code == 1 {
            return Ok(None);
        }
        let output = self
            .run(&args(&["show-ref", "--verify", "--hash", reference]))
            .await?;
        ensure_checkout(&output)?;
        Ok(Some(String::from_utf8(output.stdout)?.trim().to_owned()))
    }
    pub(in crate::stash) async fn branch_has_settings(&self, name: &str) -> Result<bool> {
        Ok(!self.branch_settings(name).await?.is_empty())
    }
    async fn branch_settings(&self, name: &str) -> Result<Vec<Setting>> {
        let output = self
            .run(&args(&[
                "config",
                "--local",
                "--null",
                "--list",
                "--no-includes",
            ]))
            .await?;
        ensure_checkout(&output)?;
        let prefix = format!("branch.{name}");
        let mut result = Vec::new();
        for field in output
            .stdout
            .split(|byte| *byte == 0)
            .filter(|field| !field.is_empty())
        {
            let (key, value) = match field.iter().position(|byte| *byte == b'\n') {
                Some(at) => (&field[..at], &field[at + 1..]),
                None => (field, b"true".as_slice()),
            };
            // Valueless Git boolean settings are restored as explicit true.
            if let Some(at) = key.iter().rposition(|byte| *byte == b'.')
                && key[..at] == *prefix.as_bytes()
            {
                result.push(Setting {
                    key: std::str::from_utf8(&key[at + 1..])?.into(),
                    value: value.into(),
                });
            }
        }
        Ok(result)
    }
    async fn deletion_destination(
        &self,
        name: &str,
        branches: &[Value],
        policy: &crate::BranchPolicy,
    ) -> Result<String> {
        let available = branches
            .iter()
            .filter(|branch| {
                branch["local"] == true && branch["name"] != name && branch["worktree"].is_null()
            })
            .collect::<Vec<_>>();
        if let Some(default) = &policy.default_branch
            && (!default.local
                || available
                    .iter()
                    .any(|branch| branch["ref"] == default.reference))
            && default.name != name
        {
            return Ok(default.reference.clone());
        }
        let recent = self
            .run(&args(&[
                "log",
                "-g",
                "--max-count=1000",
                "--format=%gs",
                "-z",
                "HEAD",
                "--",
            ]))
            .await?;
        if recent.code == 0 {
            for message in recent.stdout.split(|byte| *byte == 0) {
                if let Ok(message) = std::str::from_utf8(message)
                    && let Some((_, target)) = message
                        .strip_prefix("checkout: moving from ")
                        .and_then(|message| message.split_once(" to "))
                    && let Some(branch) = available.iter().find(|branch| branch["name"] == target)
                {
                    return Ok(branch["ref"].as_str().context("missing recent ref")?.into());
                }
            }
        }
        available
            .first()
            .and_then(|branch| branch["ref"].as_str())
            .map(str::to_owned)
            .context("Choose another available branch before deleting the current or only branch")
    }
    async fn deletion_plan(&self, input: &str, to: Option<&str>) -> Result<Plan> {
        let name = input.strip_prefix("refs/heads/").unwrap_or(input);
        self.validate_branch(name).await?;
        let branches = self.branch_list().await?;
        let policy = self.branch_policy_for(&branches).await?;
        policy.ensure_delete(name)?;
        let branches = branches.as_array().context("invalid branch list")?;
        let branch = branches
            .iter()
            .find(|branch| branch["local"] == true && branch["name"] == name)
            .context("Local branch does not exist")?;
        let oid = branch["oid"]
            .as_str()
            .context("missing branch tip")?
            .to_owned();
        let (source_ref, source_head) = self.current_checkout_identity().await?;
        let current = source_ref.as_deref() == Some(format!("refs/heads/{name}").as_str());
        let destination = match to {
            Some(to) => Some(to.to_owned()),
            None if current => Some(self.deletion_destination(name, branches, &policy).await?),
            None => None,
        };
        let checkout = match &destination {
            Some(destination) => {
                let plan = self.checkout_plan(destination).await?;
                anyhow::ensure!(
                    plan.target.branch != name,
                    "Select a different branch before deleting this branch"
                );
                if plan.view["same_branch"] == true {
                    None
                } else {
                    Some(plan)
                }
            }
            None => None,
        };
        let comparison = if let Some(upstream) = branch["upstream"].as_str() {
            self.deletion_ref(upstream)
                .await?
                .map(|oid| (upstream.to_owned(), oid))
        } else {
            None
        };
        let comparison = comparison
            .or_else(|| {
                checkout
                    .as_ref()
                    .map(|plan| (plan.target.reference.clone(), plan.target.oid.clone()))
            })
            .or_else(|| source_head.clone().map(|head| ("HEAD".into(), head)));
        let merged = if source_head.is_none() && checkout.is_none() {
            None
        } else if let Some((_, target)) = &comparison {
            let output = self
                .run(&args(&["merge-base", "--is-ancestor", &oid, target]))
                .await?;
            anyhow::ensure!(
                matches!(output.code, 0 | 1),
                "cannot inspect merged branch state"
            );
            Some(output.code == 0)
        } else {
            None
        };
        let config = self.branch_settings(name).await?;
        let context = json!({"repository":self.id(),"policy":policy,"branch":branch,"branches":branches,"source_ref":source_ref,"source_head":source_head,"config":config,"effective_config":self.checkout_configuration().await?,"worktrees":self.worktrees().await?,"checkout":checkout.as_ref().map(|plan|&plan.view),"comparison":comparison,"merged":merged});
        let basis = format!("{:x}", Sha256::digest(serde_json::to_vec(&context)?));
        let view = json!({"basis":basis,"branch":branch,"policy":policy.branch(name),"default_branch":policy.default_branch,"current":current,"force_required":merged!=Some(true),"merged":merged,"merge_target":comparison,"checkout":checkout.as_ref().map(|plan|&plan.view),"config_keys":config.iter().map(|entry|&entry.key).collect::<Vec<_>>(),"in_use_worktree":if current {Value::Null} else {branch["worktree"].clone()}});
        Ok(Plan {
            local_basis: basis,
            upstream: None,
            view,
            name: name.into(),
            oid,
            config,
            checkout,
        })
    }
    async fn combined_deletion_plan(
        &self,
        name: &str,
        to: Option<&str>,
        upstream: Option<&crate::UpstreamDeletion>,
    ) -> Result<Plan> {
        let mut plan = self.deletion_plan(name, to).await?;
        plan.view["upstream"] = Value::Null;
        if let Some(options) = upstream {
            let targets = self.remote_deletion_targets().await?;
            let reference = format!("refs/heads/{}", plan.name);
            let target = targets["upstreams"]
                .as_array()
                .and_then(|targets| {
                    targets
                        .iter()
                        .find(|target| target["local_ref"] == reference)
                })
                .context("Selected local branch has no configured network upstream")?;
            let request = crate::RemoteBranchDeletion {
                remote: target["remote"]
                    .as_str()
                    .context("invalid upstream remote")?
                    .into(),
                branch: target["branch"]
                    .as_str()
                    .context("invalid upstream ref")?
                    .into(),
                expected: options.expected.clone(),
                fetch_backup: options.fetch_backup,
            };
            let mut remote = self.remote_deletion_plan(&request).await?;
            let mut sections = vec![format!("branch.{}", plan.name)];
            if let Some(checkout) = &plan.checkout
                && checkout.target.remote
            {
                sections.push(format!("branch.{}", checkout.target.branch));
            }
            remote.allow_checkout_configuration(sections, plan.checkout.is_some())?;
            let basis = format!(
                "{:x}",
                Sha256::digest(serde_json::to_vec(
                    &json!({"local":plan.view,"upstream":remote.view,"options":options})
                )?)
            );
            plan.view["basis"] = json!(basis);
            plan.view["upstream"] = remote.view.clone();
            plan.upstream = Some((request, remote));
        }
        Ok(plan)
    }
    pub(crate) async fn delete_branch_preview(
        &self,
        name: &str,
        to: Option<&str>,
        upstream: Option<&crate::UpstreamDeletion>,
    ) -> Result<Value> {
        Ok(self.combined_deletion_plan(name, to, upstream).await?.view)
    }
    async fn deletion_phase(&self, base: &Path, receipt: &mut Receipt, phase: &str) -> Result<()> {
        receipt.phase = phase.into();
        write(base, receipt).await
    }
    pub(in crate::stash) async fn deletion_hook_overrides(
        &self,
        events: &[&[u8]],
    ) -> Result<Vec<(Vec<u8>, bool)>> {
        let keys = self
            .run(&args(&[
                "config",
                "--null",
                "--name-only",
                "--get-regexp",
                "^hook\\..*\\.event$",
            ]))
            .await?;
        anyhow::ensure!(
            matches!(keys.code, 0 | 1),
            "cannot inspect configured reference hooks"
        );
        let mut enabled_keys = std::collections::BTreeSet::new();
        for event in events {
            let mut key = b"hook.".to_vec();
            key.extend_from_slice(event);
            key.extend_from_slice(b".enabled");
            enabled_keys.insert(key);
        }
        for key in keys
            .stdout
            .split(|byte| *byte == 0)
            .filter(|key| !key.is_empty())
        {
            let mut command = args(&["config", "--null", "--get-all"]);
            command.push(crate::os_from_bytes(key)?);
            let values = self.run(&command).await?;
            ensure_checkout(&values)?;
            let values = values.stdout.strip_suffix(b"\0").unwrap_or(&values.stdout);
            let mut active = false;
            for value in values.split(|byte| *byte == 0) {
                if value.is_empty() {
                    active = false;
                } else if events.contains(&value) {
                    active = true;
                }
            }
            if active {
                let prefix = key
                    .strip_suffix(b".event")
                    .context("invalid hook event key")?;
                let mut enabled = prefix.to_vec();
                enabled.extend_from_slice(b".enabled");
                enabled_keys.insert(enabled);
            }
        }
        let mut result = Vec::new();
        for key in enabled_keys {
            let mut command = args(&["config", "--bool", "--get"]);
            command.push(crate::os_from_bytes(&key)?);
            let value = self.run(&command).await?;
            anyhow::ensure!(
                matches!(value.code, 0 | 1),
                "cannot inspect reference hook enabled state"
            );
            let enabled = value.code == 1 || value.stdout == b"true\n";
            result.push((key, enabled));
        }
        Ok(result)
    }
    async fn delete_guard(
        &self,
        base: &Path,
        receipt: &Receipt,
    ) -> Result<(PathBuf, Vec<OsString>)> {
        let path = base.join(format!("{}.guard", receipt.id));
        directory(&path, true)?;
        let original = self
            .run(&args(&[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                "hooks",
            ]))
            .await?;
        ensure_checkout(&original)?;
        let original = original
            .stdout
            .strip_suffix(b"\n")
            .unwrap_or(&original.stdout);
        let shell = self.run(&args(&["var", "GIT_SHELL_PATH"])).await?;
        ensure_checkout(&shell)?;
        let shell = shell.stdout.strip_suffix(b"\n").unwrap_or(&shell.stdout);
        anyhow::ensure!(
            !shell.is_empty() && !shell.contains(&b'\n') && !shell.contains(&0),
            "unsupported native Git shell path"
        );
        let mut script = b"#!".to_vec();
        #[cfg(windows)]
        script.extend_from_slice(b"/bin/sh");
        #[cfg(not(windows))]
        {
            anyhow::ensure!(
                !shell.iter().any(u8::is_ascii_whitespace),
                "native Git hook shell cannot contain whitespace"
            );
            script.extend_from_slice(shell);
        }
        script.extend_from_slice(b"\ninput=");
        script.extend(quote(path.join("input").as_os_str().as_encoded_bytes()));
        script.extend_from_slice(b".$$\ntrap 'rm -f \"$input\"' 0\ncat >\"$input\" || exit 1\nif [ \"$1\" = prepared ]; then\n  found=0\n  while IFS=' ' read -r old new ref; do\n    if [ \"$ref\" = ");
        script.extend(quote(format!("refs/heads/{}", receipt.name).as_bytes()));
        // branch -D may send an all-zero old value. At prepared, Git holds
        // the ref locks, so read the still-current value under those locks.
        script.extend_from_slice(b" ]; then\n      actual=$(git show-ref --verify --hash \"$ref\") || exit 1\n      [ \"$actual\" = ");
        script.extend(quote(receipt.oid.as_bytes()));
        script.extend_from_slice(b" ] && [ \"$new\" = ");
        script.extend(quote("0".repeat(receipt.oid.len()).as_bytes()));
        script.extend_from_slice(b" ] || { echo 'Reviewed branch tip changed; deletion refused' >&2; exit 1; }\n      found=1\n    fi\n  done <\"$input\"\n  [ \"$found\" = 1 ] || { echo 'Expected branch deletion transaction was not found' >&2; exit 1; }\nfi\ngit -c ");
        let mut hooks = b"core.hooksPath=".to_vec();
        hooks.extend_from_slice(original);
        script.extend(quote(&hooks));
        let overrides = self
            .deletion_hook_overrides(&[b"reference-transaction"])
            .await?;
        let mut outer = Vec::new();
        for (key, enabled) in overrides {
            script.extend_from_slice(b" -c ");
            let mut setting = key.clone();
            setting.extend_from_slice(if enabled { b"=true" } else { b"=false" });
            script.extend(quote(&setting));
            let mut setting = key.clone();
            setting.extend_from_slice(if key == b"hook.reference-transaction.enabled" {
                b"=true"
            } else {
                b"=false"
            });
            outer.push(crate::os_from_bytes(&setting)?);
        }
        script.extend_from_slice(
            b" hook run --ignore-missing --to-stdin=\"$input\" reference-transaction -- \"$@\"\n",
        );
        let hook = path.join("reference-transaction");
        work::private_write(&hook, &script)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(&hook, fs::Permissions::from_mode(0o700))?;
        }
        Ok((path, outer))
    }
    pub(crate) async fn delete_branch_reviewed(
        &self,
        name: &str,
        request: DeletionRequest,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let mut plan = self
            .combined_deletion_plan(
                name,
                request.to_checkout.as_deref(),
                request.upstream.as_ref(),
            )
            .await?;
        if let Some(basis) = &request.basis {
            anyhow::ensure!(
                plan.view["basis"] == basis.as_str(),
                "Branch deletion context changed; review again"
            );
        }
        anyhow::ensure!(
            plan.view["in_use_worktree"].is_null(),
            "Branch is registered in another working tree; open or release that worktree before deleting"
        );
        if !request.force && plan.view["force_required"] == true {
            return Ok(
                json!({"code":2,"requires_force":true,"preview":plan.view,"stderr":"Review unmerged commits before forcing branch deletion"}),
            );
        }
        if let Some(checkout) = &plan.checkout {
            let (_, early) =
                self.checkout_consent(checkout, request.strategy, request.replace_stash)?;
            if let Some(early) = early {
                return Ok(
                    json!({"code":2,"requires_confirmation":true,"preview":plan.view,"checkout_result":early,"stderr":"Review local changes or choose an available checkout before deleting"}),
                );
            }
        }
        let base = self.deletion_directory().await?;
        directory(&base, true)?;
        let id = uuid::Uuid::new_v4().to_string();
        let mut receipt = Receipt {
            version: 1,
            id: id.clone(),
            repository_id: self.id(),
            created_ns: SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos(),
            name: plan.name.clone(),
            oid: plan.oid.clone(),
            backup_ref: format!("refs/desktop/deleted-branches/{id}"),
            config: plan.config.clone(),
            checkout_receipt_id: plan
                .checkout
                .as_ref()
                .map(|_| uuid::Uuid::new_v4().to_string()),
            remote_deletion_receipt_id: plan
                .upstream
                .as_ref()
                .map(|_| uuid::Uuid::new_v4().to_string()),
            phase: "prepared".into(),
            restored_as: None,
            error: None,
        };
        write(&base, &receipt).await?;
        let mut prepared_remote: Option<PreparedRemote> = None;
        let result:Result<Value>=async {
            anyhow::ensure!(self.deletion_plan(name,request.to_checkout.as_deref()).await?.view["basis"]==plan.local_basis,"Deletion changed while preparing; review again");
            self.deletion_phase(&base,&mut receipt,"backing_up").await?;
            let backup=process::run_checkout(&self.path,&args(&["update-ref","--no-deref","--create-reflog","-m",&format!("Desktop branch deletion {id}"),&receipt.backup_ref,&receipt.oid,&"0".repeat(receipt.oid.len())])).await?;ensure_checkout(&backup)?;
            self.deletion_phase(&base,&mut receipt,"backed_up").await?;
            if let Some((remote_request,remote_plan))=plan.upstream.take() {
                self.deletion_phase(&base,&mut receipt,"backing_up_upstream").await?;
                prepared_remote=Some(self.prepare_remote_deletion(remote_request,remote_plan,receipt.remote_deletion_receipt_id.clone().context("missing related remote receipt ID")?,Some(id.clone())).await?);
            }
            anyhow::ensure!(self.deletion_plan(name,request.to_checkout.as_deref()).await?.view["basis"]==plan.local_basis,"Branch context changed while preparing recovery; deletion was stopped");
            if let Some(checkout)=plan.checkout {
                self.deletion_phase(&base,&mut receipt,"switching").await?;
                let result=self.checkout_execute_id(checkout,request.strategy,request.replace_stash,request.restore_index,receipt.checkout_receipt_id.clone().context("missing related checkout ID")?).await?;
                anyhow::ensure!(result["code"]==0,"Checkout did not complete; branch was retained");
            } else {anyhow::ensure!(self.deletion_plan(name,request.to_checkout.as_deref()).await?.view["basis"]==plan.local_basis,"Branch context changed after backup; deletion was stopped");}
            anyhow::ensure!(self.branch_settings(&receipt.name).await?==receipt.config,"Branch settings changed; deletion was stopped");
            self.branch_policy().await?.ensure_delete(&receipt.name)?;
            let (guard,overrides)=self.delete_guard(&base,&receipt).await?;
            self.deletion_phase(&base,&mut receipt,"deleting").await?;
            let mut hooks=OsString::from("core.hooksPath=");hooks.push(&guard);
            let mut command=args(&["-c"]);command.push(hooks);for setting in overrides {command.push("-c".into());command.push(setting);}command.extend(args(&["branch",if request.force {"-D"} else {"-d"},"--",&receipt.name]));
            let deleted=process::run_checkout(&self.path,&command).await?;ensure_checkout(&deleted)?;
            anyhow::ensure!(self.deletion_ref(&format!("refs/heads/{}",receipt.name)).await?.is_none(),"Branch ref appeared after deletion; inspect current refs");
            self.deletion_phase(&base,&mut receipt,"local_deleted").await?;
            let upstream=if let Some(prepared)=prepared_remote.take() {
                self.deletion_phase(&base,&mut receipt,"deleting_upstream").await?;
                Some(self.execute_remote_deletion(prepared).await?)
            }else {None};
            self.deletion_phase(&base,&mut receipt,"complete").await?;
            Ok(json!({"code":0,"stdout":deleted.text().stdout,"stderr":"","receipt_id":id,"backup_ref":receipt.backup_ref,"remote_deletion_receipt_id":receipt.remote_deletion_receipt_id,"upstream_result":upstream}))
        }.await;
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                if let Some(prepared) = &mut prepared_remote {
                    self.stop_prepared_remote_deletion(prepared, &error.to_string())
                        .await?;
                }
                receipt.error = Some(error.to_string().chars().take(4096).collect());
                write(&base, &receipt).await?;
                Err(error.context(format!("Branch deletion {id} stopped during {}; inspect deleted-branches and checkout-history before retrying",receipt.phase)))
            }
        }
    }
    pub(crate) async fn deleted_branches(&self) -> Result<Value> {
        let base = self.deletion_directory().await?;
        if !directory(&base, false)? {
            return Ok(json!([]));
        }
        let mut records = Vec::new();
        for entry in fs::read_dir(&base)? {
            let name = entry?.file_name().to_string_lossy().into_owned();
            let Some(id) = name.strip_suffix(".json") else {
                continue;
            };
            if valid_id(id).is_err() {
                continue;
            }
            anyhow::ensure!(
                records.len() < 1000,
                "deletion history exceeds 1000 records; forget old recovery records"
            );
            match read(&base, id, &self.id()) {
                Ok(receipt) => {
                    let backup_oid = self.deletion_ref(&receipt.backup_ref).await?;
                    let current_oid = self
                        .deletion_ref(&format!("refs/heads/{}", receipt.name))
                        .await?;
                    let restored_oid = match &receipt.restored_as {
                        Some(name) => self.deletion_ref(&format!("refs/heads/{name}")).await?,
                        None => None,
                    };
                    records.push(json!({"id":receipt.id,"name":receipt.name,"oid":receipt.oid,"created_ns":receipt.created_ns,"phase":receipt.phase,"error":receipt.error,"backup_ref":receipt.backup_ref,"backup_oid":backup_oid,"current_oid":current_oid,"restored_as":receipt.restored_as,"restored_oid":restored_oid,"config_keys":receipt.config.iter().map(|entry|&entry.key).collect::<Vec<_>>(),"checkout_receipt_id":receipt.checkout_receipt_id,"remote_deletion_receipt_id":receipt.remote_deletion_receipt_id}));
                }
                Err(error) => records.push(json!({"id":id,"error":error.to_string()})),
            }
        }
        records.sort_by_key(|value| {
            std::cmp::Reverse(value["created_ns"].as_u64().unwrap_or_default())
        });
        Ok(json!(records))
    }
    pub(crate) async fn restore_deleted_branch(
        &self,
        id: &str,
        name: Option<&str>,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.deletion_directory().await?;
        let mut receipt = read(&base, id, &self.id())?;
        let name = name.unwrap_or(&receipt.name).to_owned();
        self.validate_branch(&name).await?;
        anyhow::ensure!(
            self.deletion_ref(&receipt.backup_ref).await?.as_deref() == Some(&receipt.oid),
            "Recovery ref is missing or changed"
        );
        anyhow::ensure!(
            self.deletion_ref(&format!("refs/heads/{name}"))
                .await?
                .is_none(),
            "Restore destination branch already exists"
        );
        anyhow::ensure!(
            self.branch_settings(&name).await?.is_empty(),
            "Restore destination already has local branch settings"
        );
        anyhow::ensure!(
            receipt.config.iter().all(|entry| !entry.key.is_empty()
                && entry
                    .key
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
                && !entry.value.contains(&0)),
            "Invalid saved branch settings"
        );
        receipt.restored_as = Some(name.clone());
        receipt.error = None;
        self.deletion_phase(&base, &mut receipt, "restoring_ref")
            .await?;
        let result: Result<Value> = async {
            let output = self.restore_branch_ref(&name, &receipt.oid).await?;
            ensure_checkout(&output)?;
            self.deletion_phase(&base, &mut receipt, "restoring_config")
                .await?;
            let mut applied = Vec::new();
            for entry in &receipt.config {
                anyhow::ensure!(
                    self.branch_settings(&name).await? == applied,
                    "Restore settings changed; inspect the retained partial restore"
                );
                let mut command = args(&[
                    "config",
                    "--local",
                    "--add",
                    "--",
                    &format!("branch.{name}.{}", entry.key),
                ]);
                command.push(crate::os_from_bytes(&entry.value)?);
                let result = self.run(&command).await?;
                ensure_checkout(&result)?;
                applied.push(entry.clone());
            }
            anyhow::ensure!(
                self.deletion_ref(&format!("refs/heads/{name}"))
                    .await?
                    .as_deref()
                    == Some(&receipt.oid),
                "Restored branch changed; inspect its current tip"
            );
            self.deletion_phase(&base, &mut receipt, "restored").await?;
            Ok(json!({"code":0,"stdout":"","stderr":"","name":name,"oid":receipt.oid}))
        }
        .await;
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                receipt.error = Some(error.to_string().chars().take(4096).collect());
                write(&base, &receipt).await?;
                Err(error.context(
                    "Branch restore partly completed; inspect deleted-branches before retrying",
                ))
            }
        }
    }
    pub(crate) async fn forget_deleted_branch(&self, id: &str) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.deletion_directory().await?;
        let mut receipt = read(&base, id, &self.id())?;
        let backup = self.deletion_ref(&receipt.backup_ref).await?;
        anyhow::ensure!(
            backup.is_none() || backup.as_deref() == Some(&receipt.oid),
            "Recovery ref changed; forgetting was refused"
        );
        self.deletion_phase(&base, &mut receipt, "forgetting")
            .await?;
        if backup.is_some() {
            let output = process::run_checkout(
                &self.path,
                &args(&[
                    "update-ref",
                    "--no-deref",
                    "-d",
                    &receipt.backup_ref,
                    &receipt.oid,
                ]),
            )
            .await?;
            ensure_checkout(&output)?;
        }
        let guard = base.join(format!("{id}.guard"));
        if fs::symlink_metadata(&guard).is_ok() {
            fs::remove_dir_all(guard)?;
        }
        fs::remove_file(base.join(format!("{id}.json")))?;
        #[cfg(unix)]
        fs::File::open(base)?.sync_all()?;
        Ok(json!({"code":0,"stdout":"","stderr":""}))
    }
}
