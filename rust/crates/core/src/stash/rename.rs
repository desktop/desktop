//! Reviewed native branch renames. Originals remain reachable until all copies
//! are stored and the renamed ref is verified. Receipts never replay commands.
use super::{Entry, Listing, ensure};
use crate::{Repository, args, discard_fs as work, process};
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
    fs,
    io::Read,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};

struct Plan {
    name_rules: Option<crate::NameRulesPolicy>,
    view: Value,
    context: Value,
    stashes: Listing,
    entries: Vec<Entry>,
}
impl Plan {
    fn ensure_capacity(&self) -> Result<()> {
        anyhow::ensure!(
            self.stashes.entries.len() + self.entries.len() <= 1000,
            "Replacement stashes would exceed the 1000-entry review limit"
        );
        Ok(())
    }
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Copy {
    original_oid: String,
    original_message: String,
    replacement_oid: Option<String>,
    message: String,
    original_removed: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u8,
    id: String,
    repository_id: String,
    created_ns: u128,
    name: String,
    new_name: String,
    oid: String,
    phase: String,
    copies: Vec<Copy>,
    error: Option<String>,
}
fn valid_id(id: &str) -> Result<()> {
    anyhow::ensure!(
        uuid::Uuid::parse_str(id)?.to_string() == id,
        "invalid branch rename receipt ID"
    );
    Ok(())
}
fn directory(base: &Path, create: bool) -> Result<bool> {
    if create {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(base)?;
    }
    match fs::symlink_metadata(base) {
        Err(error) if !create && error.kind() == std::io::ErrorKind::NotFound => return Ok(false),
        Err(error) => return Err(error.into()),
        Ok(metadata) => anyhow::ensure!(
            metadata.is_dir() && !metadata.file_type().is_symlink(),
            "branch rename receipt directory cannot be a symlink"
        ),
    }
    Ok(true)
}
fn read(base: &Path, id: &str) -> Result<Receipt> {
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
        "branch rename receipt must be a regular file"
    );
    let mut bytes = Vec::new();
    file.by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= 1024 * 1024,
        "branch rename receipt exceeds supported size"
    );
    let receipt: Receipt = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(
        receipt.version == 1 && receipt.id == id,
        "unsupported branch rename receipt"
    );
    Ok(receipt)
}
async fn write(base: &Path, receipt: &Receipt) -> Result<()> {
    let base = base.to_owned();
    let receipt = receipt.clone();
    // Persist post-mutation evidence even when its subprocess was cancelled.
    tokio::task::spawn_blocking(move || {
        directory(&base, false)?;
        let temporary = base.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
        let bytes = serde_json::to_vec_pretty(&receipt)?;
        anyhow::ensure!(
            bytes.len() <= 1024 * 1024,
            "branch rename receipt exceeds supported size"
        );
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
fn native_case_collision(output: &process::RawOutput, new_name: &str) -> bool {
    output.code == 128
        && String::from_utf8_lossy(&output.stderr)
            .trim()
            .strip_prefix("fatal: a branch named '")
            .and_then(|line| line.strip_suffix("' already exists"))
            .is_some_and(|name| name.to_lowercase() == new_name.to_lowercase())
}
impl Repository {
    async fn rename_ref(&self, name: &str) -> Result<Option<String>> {
        let output = self
            .run(&args(&[
                "show-ref",
                "--verify",
                "--hash",
                &format!("refs/heads/{name}"),
            ]))
            .await?;
        if output.code != 0 {
            // show-ref reports 128 for absent explicit refs too. Distinguish
            // missing refs from unreadable/corrupt metadata using quiet verification.
            let exists = self
                .run(&args(&[
                    "show-ref",
                    "--verify",
                    "--quiet",
                    &format!("refs/heads/{name}"),
                ]))
                .await?;
            anyhow::ensure!(
                exists.code == 1,
                "cannot inspect branch ref: {}",
                String::from_utf8_lossy(&output.stderr)
            );
            return Ok(None);
        }
        Ok(Some(String::from_utf8(output.stdout)?.trim().to_owned()))
    }
    async fn rename_plan(&self, name: &str, new_name: &str) -> Result<Plan> {
        self.validate_branch(name).await?;
        self.validate_branch(new_name).await?;
        let branches = self.branch_list().await?;
        let policy = self.branch_policy_for(&branches).await?;
        if name != new_name {
            policy.ensure_rename(name)?;
        }
        let names = branches
            .as_array()
            .context("invalid branch listing")?
            .iter()
            .filter(|branch| branch["local"] == true)
            .filter_map(|branch| branch["name"].as_str())
            .collect::<Vec<_>>();
        anyhow::ensure!(
            names.contains(&name),
            "Exact local source branch does not exist"
        );
        let oid = self
            .rename_ref(name)
            .await?
            .context("Local branch does not exist")?;
        let name_rules = if name == new_name {
            None
        } else {
            Some(self.branch_name_rules(new_name).await?)
        };
        let case_only = name != new_name && name.to_lowercase() == new_name.to_lowercase();
        let exact_destination = names.contains(&new_name);
        let other_case = names.iter().any(|candidate| {
            *candidate != name && candidate.to_lowercase() == new_name.to_lowercase()
        });
        let destination = if name == new_name {
            Some(oid.clone())
        } else {
            self.branch_destination_direct(&format!("refs/heads/{new_name}"))
                .await?;
            self.rename_ref(new_name).await?
        };
        let case_retry = case_only
            && !exact_destination
            && !other_case
            && (destination.is_none() || destination.as_deref() == Some(&oid));
        anyhow::ensure!(
            name == new_name || (!exact_destination && (destination.is_none() || case_retry)),
            "A local branch already has the new name"
        );
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        anyhow::ensure!(
            matches!(symbolic.code, 0 | 1),
            "cannot inspect current branch"
        );
        let config = self
            .run(&args(&[
                "config",
                "--null",
                "--list",
                "--includes",
                "--show-origin",
            ]))
            .await?;
        ensure(&config)?;
        let context = json!({"repository_id":self.id(), "policy":policy, "name_rules":name_rules, "name":name, "new_name":new_name, "oid":oid, "symbolic_head":symbolic.stdout, "branches":branches, "worktrees":self.worktrees().await?, "configuration":config.stdout});
        let stashes = self.stashes().await?;
        anyhow::ensure!(
            !stashes.has_more,
            "Review fewer than 1001 saved stashes before renaming a branch"
        );
        let entries = stashes
            .entries
            .iter()
            .filter(|entry| entry.branch.as_deref() == Some(name))
            .cloned()
            .collect::<Vec<_>>();
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(
                &json!({"context":context,"stashes":stashes.basis})
            )?)
        );
        let view = json!({"basis":basis,"name":name,"new_name":new_name,"oid":oid,"unchanged":name==new_name,"policy":policy.branch(name),"name_rules":name_rules,"case_only":case_only,"case_retry":case_retry,"saved_stashes":entries,"destination_stashes":stashes.entries.iter().filter(|entry|entry.branch.as_deref()==Some(new_name)).collect::<Vec<_>>()});
        Ok(Plan {
            name_rules,
            view,
            context,
            stashes,
            entries,
        })
    }
    pub(crate) async fn rename_branch_preview(&self, name: &str, new_name: &str) -> Result<Value> {
        let name = name.strip_prefix("refs/heads/").unwrap_or(name);
        let plan = self.rename_plan(name, new_name).await?;
        plan.ensure_capacity()?;
        Ok(plan.view)
    }
    pub(crate) async fn rename_branch(
        &self,
        name: &str,
        new_name: &str,
        basis: Option<&str>,
    ) -> Result<Value> {
        let name = name.strip_prefix("refs/heads/").unwrap_or(name);
        let _lock = self.stash_lock().await?;
        let plan = self.rename_plan(name, new_name).await?;
        if let Some(policy) = &plan.name_rules {
            policy.ensure_allowed()?;
        }
        plan.ensure_capacity()?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                plan.view["basis"] == basis,
                "Branch rename review changed; refresh before renaming"
            );
        }
        if name == new_name {
            return Ok(json!({"code":0,"stdout":"","stderr":"","unchanged":true}));
        }
        let base = self.git_directory().await?.join("desktop-branch-renames");
        directory(&base, true)?;
        let id = uuid::Uuid::new_v4().to_string();
        let mut receipt = Receipt {
            version: 1,
            id: id.clone(),
            repository_id: self.id(),
            created_ns: SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos(),
            name: name.into(),
            new_name: new_name.into(),
            oid: plan.view["oid"]
                .as_str()
                .context("missing branch tip")?
                .into(),
            phase: "preparing".into(),
            error: None,
            copies: plan
                .entries
                .iter()
                .enumerate()
                .map(|(i, entry)| Copy {
                    original_oid: entry.oid.clone(),
                    original_message: entry.message.clone(),
                    replacement_oid: None,
                    message: format!("Desktop rename {id} ({i}) {}", super::message(new_name)),
                    original_removed: false,
                })
                .collect(),
        };
        write(&base, &receipt).await?;
        let result: Result<Value> = async {
            for (i, entry) in plan.entries.iter().enumerate().rev() {
                let oid = self.copy_stash(entry, &receipt.copies[i].message).await?;
                receipt.copies[i].replacement_oid = Some(oid.clone());
                receipt.phase = "storing".into();
                write(&base, &receipt).await?;
                let output = process::run_stash(&self.path, &args(&["stash","store","-m",&receipt.copies[i].message,&oid])).await?;
                ensure(&output)?;
            }
            let fresh = self.rename_plan(name, new_name).await?;
            if let Some(policy) = &fresh.name_rules { policy.ensure_allowed()?; }
            anyhow::ensure!(fresh.context == plan.context, "Branch context changed while saving replacements; originals and replacements are retained");
            // Every replacement must be exactly the prefix created by this
            // workflow. An external reflog writer stops us before ref mutation.
            let prefix = receipt.copies.iter().collect::<Vec<_>>();
            anyhow::ensure!(fresh.stashes.entries.len() == prefix.len() + plan.stashes.entries.len()
                && fresh.stashes.entries.iter().take(prefix.len()).zip(&prefix).all(|(entry,copy)| Some(&entry.oid) == copy.replacement_oid.as_ref() && entry.message == copy.message)
                && fresh.stashes.entries.iter().skip(prefix.len()).zip(&plan.stashes.entries).all(|(a,b)| a.oid==b.oid && a.message==b.message && a.timestamp==b.timestamp), "Stash list changed while saving replacements; all saved entries are retained");
            receipt.phase = "renaming".into();
            write(&base, &receipt).await?;
            let mut renamed = process::run_checkout(&self.path,&args(&["branch","-m","--",name,new_name])).await?;
            if renamed.code!=0 && fresh.view["case_retry"]==true && native_case_collision(&renamed,new_name) {
                let retry=self.rename_plan(name,new_name).await?;
                if let Some(policy) = &retry.name_rules { policy.ensure_allowed()?; }
                anyhow::ensure!(retry.context==fresh.context && retry.stashes.basis==fresh.stashes.basis && retry.view["case_retry"]==true,"Case-only rename context changed; originals and replacements are retained");
                receipt.phase="retrying_case_rename".into();write(&base,&receipt).await?;
                renamed=process::run_checkout(&self.path,&args(&["branch","-M","--",name,new_name])).await?;
            }
            anyhow::ensure!(renamed.code == 0, "Git branch rename failed: {}", String::from_utf8_lossy(&renamed.stderr));
            anyhow::ensure!(self.rename_ref(name).await?.is_none() && self.rename_ref(new_name).await?.as_deref() == Some(&receipt.oid), "Branch rename partly completed or refs changed; saved originals are retained");
            receipt.phase = "removing_originals".into();
            write(&base, &receipt).await?;
            for i in 0..receipt.copies.len() {
                let current = self.stashes().await?;
                let copy = &receipt.copies[i];
                anyhow::ensure!(current.entries.iter().any(|entry|Some(&entry.oid)==copy.replacement_oid.as_ref() && entry.message==copy.message), "Replacement stash changed; remaining originals are retained");
                let entry = current.entries.iter().find(|entry|entry.oid==copy.original_oid && entry.message==copy.original_message).context("Original stash list changed; remaining saved changes are retained")?;
                let result = self.stash_drop_checked(&entry.oid,entry.index,&current.basis).await?;
                anyhow::ensure!(result["code"] == 0, "Branch renamed; an original stash could not be removed and is retained");
                receipt.copies[i].original_removed = true;
                write(&base, &receipt).await?;
            }
            receipt.phase = "complete".into();
            write(&base, &receipt).await?;
            Ok(json!({"code":0,"stdout":"","stderr":"","receipt":receipt}))
        }.await;
        match result {
            Ok(value) => Ok(value),
            Err(error) => {
                receipt.error = Some(error.to_string().chars().take(4096).collect());
                write(&base, &receipt).await?;
                Err(error.context(format!("Branch rename {id} stopped during {}; inspect branch-rename-history and saved stashes before retrying",receipt.phase)))
            }
        }
    }
    pub(crate) async fn branch_rename_history(&self) -> Result<Value> {
        let base = self.git_directory().await?.join("desktop-branch-renames");
        if !directory(&base, false)? {
            return Ok(json!([]));
        }
        let listing = self.stashes().await?;
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
                "branch rename history exceeds 1000 entries; acknowledge old receipts"
            );
            match read(&base, id) {
                Ok(receipt) => {
                    anyhow::ensure!(
                        receipt.repository_id == self.id(),
                        "branch rename receipt belongs to another working tree"
                    );
                    let saved = listing
                        .entries
                        .iter()
                        .filter(|entry| {
                            receipt.copies.iter().any(|copy| {
                                entry.oid == copy.original_oid
                                    || Some(&entry.oid) == copy.replacement_oid.as_ref()
                            })
                        })
                        .collect::<Vec<_>>();
                    let source_oid = self.rename_ref(&receipt.name).await?;
                    let destination_oid = self.rename_ref(&receipt.new_name).await?;
                    records.push(json!({"receipt":receipt,"saved_stashes":saved,"source_oid":source_oid,"destination_oid":destination_oid}));
                }
                Err(error) => records.push(json!({"id":id,"error":error.to_string()})),
            }
        }
        records.sort_by_key(|value| {
            std::cmp::Reverse(value["receipt"]["created_ns"].as_u64().unwrap_or_default())
        });
        Ok(json!(records))
    }
    pub(crate) async fn acknowledge_branch_rename(&self, id: &str) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.git_directory().await?.join("desktop-branch-renames");
        let receipt = read(&base, id)?;
        anyhow::ensure!(
            receipt.repository_id == self.id(),
            "branch rename receipt belongs to another working tree"
        );
        fs::remove_file(base.join(format!("{id}.json")))?;
        #[cfg(unix)]
        fs::File::open(base)?.sync_all()?;
        Ok(json!({"code":0,"stdout":"","stderr":""}))
    }
}
