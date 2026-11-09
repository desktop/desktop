//! Native branch creation feeds the same reviewed checkout/stash workflow.
use super::super::Listing;
use super::{Creation, CreationRequest, Plan, Target, ensure_checkout};
use crate::{ChangesStrategy, Repository, args, process};
use anyhow::{Context, Result};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

impl Repository {
    async fn creation_ref(&self, reference: &str) -> Result<Option<String>> {
        let exists = self
            .run(&args(&["show-ref", "--verify", "--quiet", reference]))
            .await?;
        anyhow::ensure!(
            matches!(exists.code, 0 | 1),
            "cannot inspect branch creation ref"
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
    async fn create_branch_plan(&self, name: &str, request: CreationRequest) -> Result<Plan> {
        anyhow::ensure!(
            !(request.no_track && request.track_direct),
            "Branch tracking choices conflict"
        );
        self.validate_branch(name).await?;
        let reference = format!("refs/heads/{name}");
        self.branch_destination_direct(&reference).await?;
        anyhow::ensure!(
            self.creation_ref(&reference).await?.is_none(),
            "A local branch already has this name"
        );
        let name_rules = self.branch_name_rules(name).await?;
        let (source, head) = self.current_checkout_identity().await?;
        let (oid, start_ref, start_oid) = if head.is_none() && request.start_point.is_none() {
            anyhow::ensure!(
                request.checkout,
                "Create an initial commit first, or create and switch to an unborn branch"
            );
            anyhow::ensure!(
                source.as_deref() != Some(&reference),
                "Already on this unborn branch"
            );
            (String::new(), None, None)
        } else {
            let revision = request.start_point.as_deref().unwrap_or("HEAD");
            anyhow::ensure!(
                !revision.is_empty()
                    && !revision.starts_with('-')
                    && !revision.contains(['\0', '\n', '\r']),
                "invalid branch start point"
            );
            // Canonical refs are exact even if a local branch is literally named
            // like a remote ref. Native Git still handles tracking configuration.
            let raw = if revision.starts_with("refs/") {
                self.creation_ref(revision)
                    .await?
                    .context("Branch start ref does not exist")?
            } else {
                revision.to_owned()
            };
            let commit = self
                .run(&args(&[
                    "-c",
                    "core.warnAmbiguousRefs=false",
                    "rev-parse",
                    "--verify",
                    "--end-of-options",
                    &format!("{raw}^{{commit}}"),
                ]))
                .await?;
            ensure_checkout(&commit)?;
            let oid = String::from_utf8(commit.stdout)?.trim().to_owned();
            let symbolic = self
                .run(&args(&[
                    "-c",
                    "core.warnAmbiguousRefs=false",
                    "rev-parse",
                    "--symbolic-full-name",
                    "--verify",
                    "--end-of-options",
                    revision,
                ]))
                .await?;
            ensure_checkout(&symbolic)?;
            let symbolic = String::from_utf8(symbolic.stdout)?.trim().to_owned();
            let start_ref = symbolic.starts_with("refs/").then_some(symbolic);
            let start_oid = match &start_ref {
                Some(reference) => Some(
                    self.creation_ref(reference)
                        .await?
                        .context("Branch start ref disappeared")?,
                ),
                None => None,
            };
            (oid, start_ref, start_oid)
        };
        let defer_to_switch = head.is_none() && request.checkout;
        let target = Target {
            request: name.into(),
            branch: name.into(),
            reference,
            oid,
            remote: false,
            creation: Some(Creation {
                request,
                start_ref,
                start_oid,
                defer_to_switch,
                name_rules: Some(name_rules),
            }),
        };
        if target
            .creation
            .as_ref()
            .is_some_and(|creation| !creation.request.checkout)
        {
            self.create_branch_ref_plan(target).await
        } else {
            self.checkout_plan_for(target).await
        }
    }
    async fn create_branch_ref_plan(&self, target: Target) -> Result<Plan> {
        let (source_ref, source_head) = self.current_checkout_identity().await?;
        let source_branch = source_ref
            .as_deref()
            .and_then(|reference| reference.strip_prefix("refs/heads/"));
        // A ref-only operation must work even with a conflicted/corrupt index
        // or unreadable working file. None of those are inputs to Git branch.
        let context = json!({"repository":self.id(),"target":target,"source_ref":source_ref,"source_head":source_head,"configuration":self.checkout_configuration().await?,"branches":self.branch_list().await?,"worktrees":self.worktrees().await?});
        let basis = format!("{:x}", Sha256::digest(serde_json::to_vec(&context)?));
        let view = json!({"basis":basis,"name_rules":target.creation.as_ref().and_then(|creation| creation.name_rules.as_ref()),"target":target,"source_branch":source_branch,"source_head":source_head,"dirty":false,"files":[],"operation":null,"conflicted":false,"can_leave":source_branch.is_some()&&source_head.is_some(),"same_branch":false,"source_stash":null,"target_stash":null,"occupied_worktree":null});
        Ok(Plan {
            view,
            target,
            source_ref,
            source_head,
            stashes: Listing {
                basis: String::new(),
                entries: Vec::new(),
                has_more: false,
            },
        })
    }
    pub(super) async fn refresh_checkout_plan(&self, target: &Target) -> Result<Plan> {
        match &target.creation {
            Some(creation) => {
                self.create_branch_plan(&target.branch, creation.request.clone())
                    .await
            }
            None => self.checkout_plan(&target.request).await,
        }
    }
    pub(crate) async fn create_branch_preview(
        &self,
        name: &str,
        start_point: Option<String>,
        no_track: bool,
        checkout: bool,
    ) -> Result<Value> {
        Ok(self
            .create_branch_plan(
                name,
                CreationRequest {
                    start_point,
                    no_track,
                    track_direct: false,
                    checkout,
                },
            )
            .await?
            .view)
    }
    pub(crate) async fn create_branch_reviewed(
        &self,
        name: &str,
        request: CreationRequest,
        strategy: ChangesStrategy,
        basis: Option<&str>,
        replace: bool,
        restore_index: bool,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let plan = self.create_branch_plan(name, request).await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                plan.view["basis"] == basis,
                "Branch creation files, source, target, stashes or settings changed; review again"
            );
        }
        self.checkout_execute(plan, strategy, replace, restore_index)
            .await
    }
    pub(super) async fn creation_preflight(&self, target: &Target) -> Result<()> {
        let creation = target
            .creation
            .as_ref()
            .context("missing branch creation request")?;
        creation.ensure_name_rules()?;
        self.branch_destination_direct(&target.reference).await?;
        anyhow::ensure!(
            self.creation_ref(&target.reference).await?.is_none(),
            "Branch appeared during creation; saved changes are retained"
        );
        if let Some(reference) = &creation.start_ref {
            anyhow::ensure!(
                self.creation_ref(reference).await? == creation.start_oid,
                "Branch start ref changed; review creation again"
            );
        }
        Ok(())
    }
    pub(super) async fn create_branch_native(
        &self,
        target: &Target,
        base: &std::path::Path,
        id: &str,
    ) -> Result<()> {
        self.creation_preflight(target).await?;
        let creation = target
            .creation
            .as_ref()
            .context("missing branch creation request")?;
        if creation.defer_to_switch {
            return Ok(());
        }
        // Preserve native autoSetupMerge/autoSetupRebase/inherit behavior by
        // supplying the reviewed canonical source ref rather than only its OID.
        let start = creation.start_ref.as_deref().unwrap_or(&target.oid);
        let source = creation
            .start_ref
            .as_deref()
            .zip(creation.start_oid.as_deref());
        let mut command = self
            .branch_creation_guard(base, id, &target.reference, &target.oid, source)
            .await?;
        command.extend(args(&["-c", "core.warnAmbiguousRefs=false", "branch"]));
        if creation.request.no_track {
            command.push("--no-track".into());
        } else if creation.request.track_direct {
            command.push("--track=direct".into());
        }
        command.extend(args(&["--", &target.branch, start]));
        let output = process::run_checkout(&self.path, &command).await?;
        ensure_checkout(&output)?;
        self.checkout_target_current(target).await
    }
}
