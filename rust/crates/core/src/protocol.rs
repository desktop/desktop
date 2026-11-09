use serde::{Deserialize, Serialize};

/// A literal repository-relative path, preserving Unix filename bytes when needed.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum GitPath {
    Text(String),
    Bytes { bytes: Vec<u8> },
}

/// Inputs explicitly reviewed before publishing a local repository.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct PublishPreviewRequest {
    pub host: String,
    pub target: crate::AccountTarget,
    pub owner: String,
    pub name: String,
    pub description: String,
    pub private: bool,
}

/// Typed operations shared by the CLI, browser transport, and native shell.
#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "method", rename_all = "snake_case", deny_unknown_fields)]
pub enum Operation {
    LfsTransfer {
        request: crate::LfsTransferRequest,
    },
    LfsCheckout {
        #[serde(default)]
        patterns: Vec<GitPath>,
    },
    LfsTrack {
        patterns: Vec<String>,
        #[serde(default)]
        filename: bool,
        lockable: Option<bool>,
    },
    LfsUntrack {
        patterns: Vec<String>,
    },
    LfsToolStatus,
    LfsStatus {
        #[serde(default)]
        paths: Vec<GitPath>,
    },
    LfsInstall {
        #[serde(default)]
        scope: crate::LfsInstallScope,
        #[serde(default)]
        force: bool,
        #[serde(default)]
        skip_repo: bool,
        #[serde(default)]
        skip_smudge: bool,
    },
    Github {
        request: crate::GitHubRequest,
    },
    History {
        revision: Option<String>,
        #[serde(default)]
        offset: usize,
        #[serde(default = "history_limit")]
        limit: u16,
    },
    CommitFiles {
        commit: String,
        #[serde(default)]
        parent: usize,
    },
    CommitDiff {
        path: GitPath,
        commit: String,
        #[serde(default)]
        parent: usize,
    },
    BranchList,
    BranchPolicy,
    BranchNameRules {
        name: String,
    },
    UpstreamSetupPreview,
    SetupUpstream {
        basis: Option<String>,
    },
    PublishContext {
        host: String,
    },
    PublishOrganizations {
        host: String,
        target: crate::AccountTarget,
    },
    PublishPreview {
        request: PublishPreviewRequest,
    },
    PublishCreate {
        request: PublishPreviewRequest,
        basis: String,
        acknowledge_partial: bool,
    },
    PublishContinuePreview {
        receipt_id: String,
    },
    PublishContinue {
        receipt_id: String,
        basis: String,
        acknowledge_partial: bool,
    },
    PublishHistory {},
    AcknowledgePublish {
        receipt_id: String,
    },
    RepositoryAccount,
    RepositoryAccountCatalog,
    RepositoryAccountPreview {
        target: crate::AccountTarget,
    },
    SetRepositoryAccount {
        target: crate::AccountTarget,
        basis: String,
    },
    RepositoryContext,
    RefreshRepositoryContext,
    SetForkContributionTarget {
        target: crate::ForkContributionTarget,
        basis: Option<String>,
    },
    RemoteDeletionTargets,
    RemoteBranchDeletePreview {
        request: crate::RemoteBranchDeletion,
    },
    DeleteRemoteBranch {
        request: crate::RemoteBranchDeletion,
        basis: Option<String>,
    },
    RemoteDeletionHistory,
    RestoreRemoteTip {
        receipt_id: String,
        endpoint: usize,
        name: String,
    },
    ForgetRemoteDeletion {
        receipt_id: String,
    },
    ConflictDetail {
        path: GitPath,
    },
    StageConflict {
        path: GitPath,
        basis: String,
        #[serde(default)]
        allow_markers: bool,
    },
    ResolveConflict {
        path: GitPath,
        choice: ConflictChoice,
        basis: String,
    },
    Recover {
        kind: RecoveryKind,
        action: RecoveryAction,
    },
    RenameBranchPreview {
        name: String,
        new_name: String,
    },
    BranchRenameHistory,
    AcknowledgeBranchRename {
        receipt_id: String,
    },
    RenameBranch {
        name: String,
        new_name: String,
        basis: Option<String>,
    },
    TrackBranch {
        name: String,
        upstream: String,
    },
    Detach {
        commit: String,
    },
    GitSettings {
        #[serde(default)]
        scope: crate::ConfigScope,
    },
    SetGitSetting {
        #[serde(default)]
        scope: crate::ConfigScope,
        key: String,
        value: Option<String>,
    },
    Worktrees,
    WorktreeAdd {
        path: GitPath,
        branch: String,
        #[serde(default)]
        new_branch: bool,
        start: Option<String>,
    },
    WorktreeRemove {
        path: GitPath,
        #[serde(default)]
        force: bool,
    },
    WorktreeMove {
        from: GitPath,
        to: GitPath,
    },
    WorktreeLock {
        path: GitPath,
        locked: bool,
        reason: Option<String>,
    },
    WorktreePrune {
        #[serde(default = "default_true")]
        dry_run: bool,
    },
    Submodules,
    SubmoduleUpdate {
        #[serde(default)]
        paths: Vec<GitPath>,
        #[serde(default = "default_true")]
        recursive: bool,
    },
    SubmoduleSync {
        #[serde(default)]
        paths: Vec<GitPath>,
        #[serde(default = "default_true")]
        recursive: bool,
    },
    SubmoduleDeinit {
        paths: Vec<GitPath>,
        #[serde(default)]
        force: bool,
    },
    SubmoduleAdd {
        url: String,
        path: GitPath,
        name: Option<String>,
    },
    Status,
    Snapshot,
    Log,
    Branches,
    Diff {
        #[serde(default)]
        staged: bool,
        path: Option<GitPath>,
    },
    DiffDetail {
        path: GitPath,
        #[serde(default)]
        staged: bool,
    },
    SelectDiff {
        path: GitPath,
        #[serde(default)]
        staged: bool,
        basis: String,
        lines: Vec<usize>,
    },
    DiscardPreview {
        path: GitPath,
        #[serde(default)]
        scope: DiscardScope,
        selection: Option<DiscardSelection>,
    },
    Discard {
        path: GitPath,
        #[serde(default)]
        scope: DiscardScope,
        selection: Option<DiscardSelection>,
        basis: String,
    },
    ListDiscards,
    ForgetDiscard {
        undo_id: String,
    },
    UndoDiscard {
        undo_id: String,
    },
    Stage {
        paths: Vec<GitPath>,
    },
    Unstage {
        paths: Vec<GitPath>,
    },
    CommitPreview,
    Commit {
        #[serde(default)]
        allow_large_files: bool,
        basis: Option<String>,
        summary: String,
        #[serde(default)]
        description: String,
    },
    CheckoutPreview {
        branch: String,
    },
    CheckoutHistory,
    AcknowledgeCheckout {
        receipt_id: String,
    },
    Checkout {
        branch: String,
        #[serde(default)]
        strategy: ChangesStrategy,
        basis: Option<String>,
        #[serde(default)]
        replace_stash: bool,
        #[serde(default)]
        restore_index: bool,
    },
    CreateBranchPreview {
        name: String,
        start_point: Option<String>,
        #[serde(default)]
        no_track: bool,
        #[serde(default)]
        checkout: bool,
    },
    CreateBranch {
        name: String,
        start_point: Option<String>,
        #[serde(default)]
        no_track: bool,
        #[serde(default)]
        checkout: bool,
        #[serde(default)]
        strategy: ChangesStrategy,
        basis: Option<String>,
        #[serde(default)]
        replace_stash: bool,
        #[serde(default)]
        restore_index: bool,
    },
    DeleteBranchPreview {
        name: String,
        to_checkout: Option<String>,
        upstream: Option<crate::UpstreamDeletion>,
    },
    DeleteBranch {
        name: String,
        to_checkout: Option<String>,
        #[serde(default)]
        force: bool,
        #[serde(default)]
        strategy: ChangesStrategy,
        basis: Option<String>,
        #[serde(default)]
        replace_stash: bool,
        #[serde(default)]
        restore_index: bool,
        upstream: Option<crate::UpstreamDeletion>,
    },
    DeletedBranches,
    RestoreDeletedBranch {
        receipt_id: String,
        name: Option<String>,
    },
    ForgetDeletedBranch {
        receipt_id: String,
    },
    Fetch {
        remote: String,
    },
    Pull {
        remote: String,
        branch: String,
    },
    Push {
        remote: String,
        branch: String,
        #[serde(default)]
        set_upstream: bool,
    },
    Merge {
        branch: String,
    },
    MergeAbort,
    Rebase {
        branch: String,
    },
    RebaseAbort,
    RebaseContinue,
    CherryPick {
        commit: String,
        mainline: Option<u32>,
    },
    Revert {
        commit: String,
        mainline: Option<u32>,
    },
    StashSave {
        #[serde(default)]
        message: String,
        #[serde(default)]
        include_untracked: bool,
        #[serde(default)]
        desktop: bool,
    },
    StashList,
    StashFiles {
        oid: String,
    },
    StashApply {
        oid: String,
        index: Option<u32>,
        basis: Option<String>,
        #[serde(default)]
        restore_index: bool,
        #[serde(default)]
        pop: bool,
    },
    StashDrop {
        oid: String,
        index: u32,
        basis: String,
    },
    StashMove {
        oid: String,
        index: u32,
        basis: String,
        branch: String,
    },
    Tags,
    TagCreate {
        name: String,
        target: Option<String>,
    },
    TagDelete {
        name: String,
    },
    Remotes,
    AddRemote {
        name: String,
        url: String,
    },
    RemoveRemote {
        name: String,
    },
}

#[derive(Debug, Serialize)]
pub struct CommandOutput {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
pub struct FileChange {
    /// Display only; operations should send `path`, which preserves exact bytes.
    pub display_path: String,
    pub path: GitPath,
    pub original_path: Option<GitPath>,
    pub index: char,
    pub worktree: char,
    pub conflicted: bool,
    pub size: Option<u64>,
    pub modified_ns: Option<u128>,
}

#[derive(Debug, Serialize)]
pub struct Snapshot {
    pub root: String,
    pub root_id: String,
    pub branch: Option<String>,
    pub head: Option<String>,
    pub files: Vec<FileChange>,
    pub branch_policy: Option<crate::BranchPermissions>,
    pub default_branch: Option<crate::DefaultBranch>,
    pub repository_context: crate::RepositoryContext,
    pub repository_account: crate::RepositoryAccount,
    pub upstream: Option<String>,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
    pub operation: Option<crate::OperationState>,
}

fn history_limit() -> u16 {
    30
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictChoice {
    Ours,
    Theirs,
    Delete,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryKind {
    Merge,
    Rebase,
    CherryPick,
    Revert,
    Am,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryAction {
    Continue,
    Abort,
    Skip,
    Quit,
}

fn default_true() -> bool {
    true
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscardScope {
    #[default]
    AllChanges,
    WorkingTree,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DiscardSelection {
    pub basis: String,
    pub lines: Vec<usize>,
}

/// Values match the shared upstream UncommittedChangesStrategy model.
#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub enum ChangesStrategy {
    #[default]
    AskForConfirmation,
    StashOnCurrentBranch,
    MoveToNewBranch,
}
