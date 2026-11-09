use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use desktop_core::{GitPath, Operation, Repository};
use std::{ffi::OsString, path::PathBuf, process::Command};

#[derive(Parser)]
#[command(
    version,
    about = "Headless GitHub Desktop migration: system Git + GitHub CLI"
)]
struct Cli {
    #[arg(short = 'C', long, default_value = ".")]
    repo: PathBuf,
    /// Registry JSON location (defaults to the native app configuration directory).
    #[arg(long)]
    config: Option<PathBuf>,
    /// Use the selected saved repository instead of the current directory.
    #[arg(long, conflicts_with = "repo")]
    selected: bool,
    #[command(subcommand)]
    command: Action,
}

#[derive(Subcommand)]
enum AccountAction {
    /// List stored accounts for the fetch host, without changing the active gh account.
    Catalog,
    /// Assign a named stored account after reviewing its verified actor and access.
    Assign {
        host: String,
        login: String,
        #[arg(long, conflicts_with = "basis")]
        preview: bool,
        #[arg(long, required_unless_present = "preview")]
        basis: Option<String>,
    },
    /// Disable typed GitHub API operations without signing out or changing Git author.
    None {
        #[arg(long, conflicts_with = "basis")]
        preview: bool,
        #[arg(long, required_unless_present = "preview")]
        basis: Option<String>,
    },
    /// Explicitly use gh's effective credential for future repository operations.
    Effective {
        #[arg(long, conflicts_with = "basis")]
        preview: bool,
        #[arg(long, required_unless_present = "preview")]
        basis: Option<String>,
    },
}

#[derive(Subcommand)]
enum PublishAction {
    /// Inspect publication defaults and available accounts without changing a repository.
    Context {
        #[arg(long, default_value = "github.com")]
        host: String,
    },
    /// List organizations for a selected stored account or gh's effective credential.
    Organizations {
        #[arg(long, default_value = "github.com")]
        host: String,
        #[arg(
            long,
            conflicts_with = "effective",
            required_unless_present = "effective"
        )]
        login: Option<String>,
        #[arg(long, conflicts_with = "login")]
        effective: bool,
    },
    /// Review the proposed publication without creating a remote repository.
    Preview {
        #[arg(long, default_value = "github.com")]
        host: String,
        #[arg(
            long,
            conflicts_with = "effective",
            required_unless_present = "effective"
        )]
        login: Option<String>,
        #[arg(long, conflicts_with = "login")]
        effective: bool,
        #[arg(long)]
        owner: String,
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "")]
        description: String,
        /// Propose a public repository (private by default).
        #[arg(long)]
        public: bool,
    },
    /// Create only the reviewed remote; origin and pushes are not implemented.
    Create {
        #[arg(long, default_value = "github.com")]
        host: String,
        #[arg(
            long,
            conflicts_with = "effective",
            required_unless_present = "effective"
        )]
        login: Option<String>,
        #[arg(long, conflicts_with = "login")]
        effective: bool,
        #[arg(long)]
        owner: String,
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long)]
        public: bool,
        /// Basis returned by a matching publication preview.
        #[arg(long)]
        basis: String,
        /// Acknowledge remote-only creation: origin and pushes are pending. Once started,
        /// it blocks another attempt, even after acknowledgement; reconciliation and a recoverable
        /// URL are not implemented yet.
        #[arg(long)]
        acknowledge_partial: bool,
    },
    /// Review a confirmed remote before continuing publication.
    ContinuePreview { receipt_id: String },
    /// Configure origin and associate the reviewed account; pushing is not implemented.
    Continue {
        receipt_id: String,
        #[arg(long)]
        basis: String,
        /// Acknowledge that this step does not push branches.
        #[arg(long)]
        acknowledge_partial: bool,
    },
    /// Inspect durable records of publication attempts.
    History,
    /// Acknowledge a publication record without retrying or deleting it.
    Acknowledge { receipt_id: String },
}

#[derive(Subcommand)]
enum Action {
    #[command(name = "__credential-helper", hide = true)]
    CredentialHelper { operation: String },
    /// Open a file or repository in the selected editor, preserving the terminal.
    Editor {
        path: Option<PathBuf>,
        #[arg(long, conflicts_with = "path")]
        list: bool,
    },
    /// Forward all arguments to system Git with the terminal and exit status intact.
    #[command(disable_help_flag = true)]
    Git {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<OsString>,
    },
    /// Forward all arguments to gh, including auth, repo, pr, issue, api, extensions.
    #[command(disable_help_flag = true)]
    Gh {
        #[arg(trailing_var_arg = true, allow_hyphen_values = true)]
        args: Vec<OsString>,
    },
    /// Read working tree status, optionally as JSON.
    Status {
        #[arg(long)]
        json: bool,
    },
    /// Execute a typed GitHub request (auth status, PRs, issues, workflows).
    Github { request: String },
    /// Manage saved repositories without requiring a current working tree.
    Repositories {
        #[command(subcommand)]
        action: RegistryAction,
    },
    /// Initialize and save a new repository. Existing nonempty directories are rejected.
    Init { path: PathBuf },
    /// Clone and save a repository using system Git credentials.
    Clone { url: String, path: PathBuf },
    /// Page through history pinned to a commit (JSON).
    History {
        #[arg(long)]
        revision: Option<String>,
        #[arg(long, default_value_t = 0)]
        offset: usize,
        #[arg(long, default_value_t = 30)]
        limit: u16,
    },
    /// List commit files, or show a historical file diff (JSON).
    Show {
        commit: String,
        path: Option<String>,
        #[arg(long, default_value_t = 0)]
        parent: usize,
    },
    /// Save, inspect and restore native Git stashes (JSON).
    Stash {
        #[command(subcommand)]
        action: Option<StashAction>,
    },
    /// List local and remote branch metadata (JSON).
    Branches,
    /// Inspect local default-branch inference and rename/deletion permissions (JSON).
    BranchPolicy,
    /// Check a branch name against repository- and actor-bound GitHub rules (JSON).
    BranchNameRules { name: String },
    /// Configure a verified fork's parent remote without replacing an occupied name.
    UpstreamSetup {
        #[arg(long)]
        preview: bool,
        #[arg(long, conflicts_with = "preview")]
        basis: Option<String>,
    },
    /// Inspect or explicitly review a saved repository's GitHub account assignment.
    Account {
        #[command(subcommand)]
        action: Option<AccountAction>,
    },
    /// Inspect a local repository before publishing it on GitHub.
    Publish {
        #[command(subcommand)]
        action: PublishAction,
    },
    /// Inspect cached GitHub association and the fork contribution preference.
    RepositoryContext {
        #[arg(long, conflicts_with = "target")]
        refresh: bool,
        #[arg(long, value_parser=["parent","self"])]
        target: Option<String>,
        #[arg(long, requires = "target")]
        basis: Option<String>,
    },
    /// Inspect certified conflict versions (JSON).
    Conflict { path: PathBuf },
    /// Resolve a conflict using ours, theirs, or delete and a version token.
    ResolveConflict {
        path: PathBuf,
        choice: String,
        #[arg(long)]
        basis: String,
    },
    /// Stage an externally edited conflict using its current review certificate.
    StageConflict {
        path: PathBuf,
        #[arg(long)]
        basis: String,
        #[arg(long)]
        allow_markers: bool,
    },
    /// Merge a branch or commit into the current branch.
    Merge { branch: String },
    /// Rebase the current branch onto a branch or commit.
    Rebase { branch: String },
    /// Cherry-pick a commit, selecting a merge parent when needed.
    CherryPick {
        commit: String,
        #[arg(long)]
        mainline: Option<u32>,
    },
    /// Revert a commit, selecting a merge parent when needed.
    Revert {
        commit: String,
        #[arg(long)]
        mainline: Option<u32>,
    },
    /// Continue, abort, skip, or quit an operation of the given kind.
    Recover { kind: String, action: String },
    /// Read or update application preferences independently of any repository.
    Preferences {
        #[command(subcommand)]
        action: Option<PreferencesAction>,
    },
    /// Read or change supported Git settings.
    Config {
        #[arg(long, global = true)]
        global: bool,
        #[command(subcommand)]
        action: Option<ConfigAction>,
    },
    /// List or manage linked working trees.
    Worktree {
        #[command(subcommand)]
        action: Option<WorktreeAction>,
    },
    /// Inspect Git LFS patterns/paths or explicitly install its filters and hooks.
    Lfs {
        #[command(subcommand)]
        action: Option<LfsAction>,
    },
    /// List or manage submodules.
    Submodule {
        #[command(subcommand)]
        action: Option<SubmoduleAction>,
    },
    /// Return structured, byte-preserving repository state.
    Snapshot,
    /// Stage literal paths (wildcards are not expanded by Git).
    Stage {
        #[arg(required = true)]
        paths: Vec<String>,
    },
    /// Unstage selected paths while preserving working files.
    Unstage {
        #[arg(required = true)]
        paths: Vec<String>,
    },
    /// Review staged Git blobs and get a token for explicit large-file consent.
    CommitPreview,
    /// Commit staged changes; oversized blobs require a reviewed override.
    Commit {
        #[arg(long, requires = "basis")]
        allow_large_files: bool,
        #[arg(long)]
        basis: Option<String>,
        summary: String,
        #[arg(long, default_value = "")]
        description: String,
    },
    /// Review/switch a local or remote branch, leaving or bringing local changes.
    Checkout {
        branch: String,
        #[arg(long)]
        preview: bool,
        #[arg(long, value_parser = ["ask", "leave", "bring"])]
        strategy: Option<String>,
        #[arg(long)]
        basis: Option<String>,
        #[arg(long)]
        replace_stash: bool,
        #[arg(long)]
        restore_index: bool,
        #[arg(long, conflicts_with = "preview")]
        open_worktree: bool,
    },
    /// Inspect durable branch-switch phase receipts and saved stash IDs.
    CheckoutHistory,
    /// Acknowledge a receipt without changing files or deleting saved stashes.
    CheckoutAcknowledge { receipt_id: String },
    /// Rename a local branch and preserve its branch-associated saved changes.
    RenameBranch {
        name: String,
        new_name: String,
        #[arg(long)]
        preview: bool,
        #[arg(long)]
        basis: Option<String>,
    },
    /// Inspect interrupted branch renames and the original/replacement stash IDs.
    BranchRenameHistory,
    /// Remove only the rename notice, preserving refs, files and stashes.
    BranchRenameAcknowledge { receipt_id: String },
    /// Create a branch, optionally switching to it.
    CreateBranch {
        name: String,
        #[arg(long = "start")]
        start_point: Option<String>,
        #[arg(long)]
        no_track: bool,
        #[arg(long)]
        checkout: bool,
        #[arg(long)]
        preview: bool,
        #[arg(long, value_parser = ["ask", "leave", "bring"])]
        strategy: Option<String>,
        #[arg(long)]
        basis: Option<String>,
        #[arg(long)]
        replace_stash: bool,
        #[arg(long)]
        restore_index: bool,
    },
    /// Review/delete a local branch, optionally switching away through leave/bring.
    DeleteBranch {
        name: String,
        #[arg(long = "to")]
        to_checkout: Option<String>,
        #[arg(long)]
        preview: bool,
        #[arg(long)]
        force: bool,
        #[arg(long, value_parser = ["ask", "leave", "bring"])]
        strategy: Option<String>,
        #[arg(long)]
        basis: Option<String>,
        #[arg(long)]
        replace_stash: bool,
        #[arg(long)]
        restore_index: bool,
        #[arg(long)]
        include_upstream: bool,
        #[arg(long, requires = "include_upstream")]
        fetch_upstream_backup: bool,
        #[arg(long = "expect-upstream", requires = "include_upstream")]
        expected_upstream: Vec<String>,
    },
    /// Inspect deleted branch recovery refs and interrupted deletions.
    DeletedBranches,
    /// List remotes and canonical upstream deletion targets without network access.
    RemoteDeletionTargets,
    /// Review/delete a remote branch with an explicit lease per push destination.
    DeleteRemoteBranch {
        remote: String,
        branch: String,
        #[arg(long)]
        preview: bool,
        #[arg(long)]
        basis: Option<String>,
        /// Complete OID or missing, repeated once per push URL; skips server reads.
        #[arg(long = "expect")]
        expected: Vec<String>,
        /// Fetch a missing remote tip into a private recovery ref before pushing.
        #[arg(long)]
        fetch_backup: bool,
    },
    /// Inspect per-destination outcomes, including interrupted remote deletions.
    RemoteDeletionHistory,
    /// Restore a retained remote tip as a local branch without switching or pushing.
    RestoreRemoteTip {
        receipt_id: String,
        endpoint: usize,
        name: String,
    },
    /// Remove private local recovery refs and metadata; never changes the remote.
    ForgetRemoteDeletion { receipt_id: String },
    /// Restore a retained tip and local branch settings without switching.
    RestoreBranch {
        receipt_id: String,
        #[arg(long)]
        name: Option<String>,
    },
    /// Permanently remove a deletion recovery ref and its record.
    ForgetDeletedBranch { receipt_id: String },
    /// Show the working or staged diff, optionally for one literal path.
    Diff {
        /// Return the structured diff and a version token for line selection.
        #[arg(long)]
        json: bool,
        #[arg(long)]
        staged: bool,
        path: Option<String>,
    },
    /// Stage or unstage changed line IDs from a structured diff.
    SelectLines {
        path: String,
        #[arg(long)]
        staged: bool,
        #[arg(long)]
        basis: String,
        #[arg(long, value_delimiter = ',', required = true)]
        lines: Vec<usize>,
    },
    /// Preview a certified discard and its undo backup size.
    DiscardPreview {
        path: String,
        #[arg(long)]
        working_tree: bool,
        #[arg(long, value_delimiter = ',', requires = "diff_basis")]
        lines: Option<Vec<usize>>,
        #[arg(long, requires = "lines")]
        diff_basis: Option<String>,
    },
    /// Apply a reviewed discard; the returned ID can restore it.
    Discard {
        path: String,
        #[arg(long)]
        basis: String,
        #[arg(long)]
        working_tree: bool,
        #[arg(long, value_delimiter = ',', requires = "diff_basis")]
        lines: Option<Vec<usize>>,
        #[arg(long, requires = "lines")]
        diff_basis: Option<String>,
    },
    /// List durable undo records, or restore a discard/resolution by its ID.
    #[command(visible_alias = "undo")]
    DiscardUndo { id: Option<String> },
    /// Permanently remove a completed discard backup without changing working files.
    DiscardForget { id: String },
    /// Fetch from a configured remote.
    Fetch { remote: String },
    /// Pull a remote branch using fast-forward only.
    Pull { remote: String, branch: String },
    /// Push a local branch without force.
    Push {
        remote: String,
        branch: String,
        #[arg(long)]
        set_upstream: bool,
    },
    /// Execute any typed protocol operation, e.g. '{"method":"stash_list"}'.
    Repo { request: String },
    /// Serve a browser client and authenticated WebSocket API on IPv4 loopback.
    Serve {
        /// Start the repository chooser without opening a working tree.
        #[arg(long)]
        empty: bool,
        #[arg(long, default_value_t = 9418)]
        port: u16,
    },
}

#[derive(Subcommand)]
enum RegistryAction {
    List,
    Add {
        path: PathBuf,
        #[arg(long)]
        select: bool,
    },
    Select {
        path: PathBuf,
    },
    /// Forget the saved entry; repository files remain on disk.
    Forget {
        path: PathBuf,
    },
}

#[derive(Subcommand)]
enum PreferencesAction {
    Set { patch: String },
}
#[derive(Subcommand)]
enum ConfigAction {
    Set { key: String, value: String },
    Unset { key: String },
}
#[derive(Subcommand)]
enum WorktreeAction {
    Add {
        path: PathBuf,
        branch: String,
        #[arg(long)]
        new_branch: bool,
        #[arg(long)]
        start: Option<String>,
    },
    Remove {
        path: PathBuf,
        #[arg(long)]
        force: bool,
    },
    Move {
        from: PathBuf,
        to: PathBuf,
    },
    Lock {
        path: PathBuf,
        #[arg(long)]
        reason: Option<String>,
    },
    Unlock {
        path: PathBuf,
    },
    Prune {
        #[arg(long)]
        apply: bool,
    },
}
#[derive(Subcommand)]
enum StashAction {
    Save {
        #[arg(default_value = "")]
        message: String,
        #[arg(long)]
        include_untracked: bool,
        #[arg(long)]
        desktop: bool,
    },
    Files {
        oid: String,
    },
    Apply {
        oid: String,
        #[arg(long)]
        index: Option<u32>,
        #[arg(long)]
        basis: Option<String>,
        #[arg(long)]
        restore_index: bool,
        #[arg(long)]
        pop: bool,
    },
    Drop {
        oid: String,
        #[arg(long)]
        index: u32,
        #[arg(long)]
        basis: String,
    },
    Move {
        oid: String,
        branch: String,
        #[arg(long)]
        index: u32,
        #[arg(long)]
        basis: String,
    },
}
#[derive(Subcommand)]
enum LfsAction {
    /// Inspect installed tooling without opening a repository.
    ToolStatus,
    /// Download objects without updating working files.
    Fetch {
        #[arg(default_value = "origin")]
        remote: String,
        refs: Vec<String>,
        #[arg(long)]
        all: bool,
        #[arg(long)]
        recent: bool,
        #[arg(long)]
        refetch: bool,
        #[arg(long)]
        dry_run: bool,
        #[arg(long)]
        include: Option<String>,
        #[arg(long)]
        exclude: Option<String>,
    },
    /// Fetch and populate current LFS files without overwriting modified files.
    Pull {
        #[arg(default_value = "origin")]
        remote: String,
        #[arg(long)]
        include: Option<String>,
        #[arg(long)]
        exclude: Option<String>,
    },
    /// Upload LFS objects; this does not push Git refs.
    Push {
        #[arg(default_value = "origin")]
        remote: String,
        refs: Vec<String>,
        #[arg(long)]
        all: bool,
        #[arg(long)]
        dry_run: bool,
    },
    /// Populate locally cached content; arguments are Git LFS glob patterns.
    Checkout { patterns: Vec<PathBuf> },
    /// Add Git LFS tracking rules to the root .gitattributes.
    Track {
        #[arg(required = true)]
        patterns: Vec<String>,
        #[arg(long)]
        filename: bool,
        #[arg(long, conflicts_with = "not_lockable")]
        lockable: bool,
        #[arg(long)]
        not_lockable: bool,
    },
    /// Remove Git LFS tracking rules (existing content is not converted).
    Untrack {
        #[arg(required = true)]
        patterns: Vec<String>,
    },
    /// Check whether literal paths use filter=lfs, without installing hooks.
    Status { paths: Vec<PathBuf> },
    /// Set up repository-local filters and hooks (global only when requested).
    Install {
        #[arg(long)]
        global: bool,
        #[arg(long)]
        force: bool,
        #[arg(long)]
        skip_repo: bool,
        #[arg(long)]
        skip_smudge: bool,
    },
}
#[derive(Subcommand)]
enum SubmoduleAction {
    Add {
        url: String,
        path: String,
        #[arg(long)]
        name: Option<String>,
    },
    Update {
        paths: Vec<String>,
        #[arg(long)]
        no_recursive: bool,
    },
    Sync {
        paths: Vec<String>,
        #[arg(long)]
        no_recursive: bool,
    },
    Deinit {
        #[arg(required = true)]
        paths: Vec<String>,
        #[arg(long)]
        force: bool,
    },
}
fn git_path(path: PathBuf) -> GitPath {
    GitPath::Bytes {
        bytes: path.into_os_string().as_encoded_bytes().to_vec(),
    }
}

#[tokio::main]
async fn main() -> Result<std::process::ExitCode> {
    let cli = Cli::parse();
    if let Action::CredentialHelper { operation } = &cli.command {
        desktop_core::git_credential_helper(operation).await?;
        return Ok(std::process::ExitCode::SUCCESS);
    }
    // Passthrough keeps the executable/TTY/signal contract; serve owns its lifecycle.
    if matches!(
        cli.command,
        Action::Git { .. } | Action::Gh { .. } | Action::Serve { .. } | Action::Editor { .. }
    ) {
        return run(cli).await.map(|()| std::process::ExitCode::SUCCESS);
    }
    let cancellation = desktop_core::cancellation::Cancellation::default();
    let watcher = watch_signals(cancellation.clone())?;
    let result = cancellation.clone().scope(run(cli)).await;
    if cancellation.is_cancelled() {
        let code = watcher.await?;
        eprintln!("{}", cancellation.message());
        Ok(std::process::ExitCode::from(code))
    } else {
        watcher.abort();
        result.map(|()| std::process::ExitCode::SUCCESS)
    }
}

fn watch_signals(
    cancellation: desktop_core::cancellation::Cancellation,
) -> Result<tokio::task::JoinHandle<u8>> {
    let mut signal = desktop_core::cancellation::ShutdownSignal::new()?;
    Ok(tokio::spawn(async move {
        let code = signal.received().await.unwrap_or(130);
        cancellation.cancel();
        code
    }))
}

struct CliRepositoryScope {
    registry: Option<desktop_core::Registry>,
    record_id: Option<String>,
}
impl CliRepositoryScope {
    fn bind(&self, repository: Repository) -> Repository {
        match (&self.registry, &self.record_id) {
            (Some(registry), Some(id)) => {
                repository.with_saved_record(registry.clone(), id.clone())
            }
            (Some(registry), None) => repository.with_registry(registry.clone()),
            (None, _) => repository,
        }
    }
    async fn open(&self, path: &std::path::Path) -> Result<Repository> {
        Ok(self.bind(Repository::open(path).await?))
    }
    fn permits_unbound_github(&self, path: &std::path::Path) -> Result<bool> {
        if self.record_id.is_some() {
            return Ok(false);
        }
        let Some(registry) = &self.registry else {
            return Ok(true);
        };
        let path = path.canonicalize().or_else(|_| std::path::absolute(path))?;
        // Refusing a fallback does not inherit an ancestor's credentials. A
        // failed native open inside saved state must remain an error.
        Ok(!registry
            .read()?
            .repositories
            .iter()
            .any(|saved| path.starts_with(saved)))
    }
}

async fn run(mut cli: Cli) -> Result<()> {
    // Choosing a configuration namespace must not require HOME or read files for
    // ordinary -C Git operations. Account-aware core paths resolve it lazily.
    let mut repository_scope = CliRepositoryScope {
        registry: cli
            .config
            .clone()
            .map(desktop_core::Registry::new)
            .or_else(|| {
                desktop_core::Registry::default_path()
                    .ok()
                    .map(desktop_core::Registry::new)
            }),
        record_id: None,
    };
    if cli.selected {
        let registry = registry(cli.config.clone())?;
        cli.repo = registry
            .read()?
            .selected
            .ok_or_else(|| anyhow::anyhow!("no saved repository is selected"))?;
        let record = registry
            .record_for_path(&cli.repo)?
            .ok_or_else(|| anyhow::anyhow!("selected repository is no longer saved"))?;
        repository_scope.registry = Some(registry);
        repository_scope.record_id = Some(record.id);
    }
    match cli.command {
        Action::CredentialHelper { .. } => unreachable!("private helper handled before repository startup"),
        Action::Editor {path,list} => {
            let configuration = registry(cli.config)?.preferences().read()?.external_editor;
            if list {
                println!("{}", desktop_core::available_editors(configuration).await?);
                return Ok(());
            }
            let repository = repository_scope.open(&cli.repo).await?;
            let plan = repository.editor_launch(path.map(git_path), configuration).await?;
            let mut command = Command::new(plan.program);
            command.args(plan.args).current_dir(plan.directory);
            #[cfg(unix)] {
                use std::os::unix::process::CommandExt;
                Err(command.exec().into())
            }
            #[cfg(not(unix))] {
                let status = command.status()?;
                std::process::exit(status.code().unwrap_or(1));
            }
        }
        Action::Stash { action } => {
            let operation = match action {
                None => Operation::StashList,
                Some(StashAction::Save {message,include_untracked,desktop}) => Operation::StashSave {message,include_untracked,desktop},
                Some(StashAction::Files {oid}) => Operation::StashFiles {oid},
                Some(StashAction::Apply {oid,index,basis,restore_index,pop}) => Operation::StashApply {oid,index,basis,restore_index,pop},
                Some(StashAction::Drop {oid,index,basis}) => Operation::StashDrop {oid,index,basis},
                Some(StashAction::Move {oid,branch,index,basis}) => Operation::StashMove {oid,branch,index,basis},
            };
            run_operation(&cli.repo, &repository_scope,operation,true).await
        },
        Action::Account { action } => {
            let operation=match action {
                None=>Operation::RepositoryAccount,
                Some(AccountAction::Catalog)=>Operation::RepositoryAccountCatalog,
                Some(action)=>{
                    let (target,preview,basis)=match action {
                        AccountAction::Assign {host,login,preview,basis}=>(desktop_core::AccountTarget::Assigned{host,login},preview,basis),
                        AccountAction::None {preview,basis}=>(desktop_core::AccountTarget::None {},preview,basis),
                        AccountAction::Effective {preview,basis}=>(desktop_core::AccountTarget::Effective {},preview,basis),
                        AccountAction::Catalog=>unreachable!("handled above"),
                    };
                    if preview {Operation::RepositoryAccountPreview{target}} else {Operation::SetRepositoryAccount{target,basis:basis.ok_or_else(||anyhow::anyhow!("Review the account change before applying it"))?}}
                },
            };
            run_operation(&cli.repo,&repository_scope,operation,true).await
        },
        Action::Publish { action } => {
            let operation = match action {
                PublishAction::Context { host } => Operation::PublishContext { host },
                PublishAction::Organizations { host, login, effective } => {
                    let target = if effective {
                        desktop_core::AccountTarget::Effective {}
                    } else {
                        desktop_core::AccountTarget::Assigned {
                            host: host.clone(),
                            login: login.context("Select an account with --login or --effective")?,
                        }
                    };
                    Operation::PublishOrganizations { host, target }
                }
                PublishAction::Preview { host, login, effective, owner, name, description, public } => {
                    let target = if effective {
                        desktop_core::AccountTarget::Effective {}
                    } else {
                        desktop_core::AccountTarget::Assigned {
                            host: host.clone(),
                            login: login.context("Select an account with --login or --effective")?,
                        }
                    };
                    Operation::PublishPreview { request: desktop_core::PublishPreviewRequest {
                        host, target, owner, name, description, private: !public,
                    }}
                }
                PublishAction::Create { host, login, effective, owner, name, description, public, basis, acknowledge_partial } => {
                    let target = if effective {
                        desktop_core::AccountTarget::Effective {}
                    } else {
                        desktop_core::AccountTarget::Assigned {
                            host: host.clone(),
                            login: login.context("Select an account with --login or --effective")?,
                        }
                    };
                    Operation::PublishCreate {
                        request: desktop_core::PublishPreviewRequest { host, target, owner, name, description, private: !public },
                        basis,
                        acknowledge_partial,
                    }
                }
                PublishAction::ContinuePreview { receipt_id } => Operation::PublishContinuePreview { receipt_id },
                PublishAction::Continue { receipt_id, basis, acknowledge_partial } => Operation::PublishContinue { receipt_id, basis, acknowledge_partial },
                PublishAction::History => Operation::PublishHistory {},
                PublishAction::Acknowledge { receipt_id } => Operation::AcknowledgePublish { receipt_id },
            };
            run_operation(&cli.repo, &repository_scope, operation, true).await
        },
        Action::Github { request } => {
            let request: desktop_core::GitHubRequest = parse_request(&request)?;
            let output = if request.is_auth_status() {
                desktop_core::execute_github(&cli.repo, request).await?
            } else {
                match repository_scope.open(&cli.repo).await {
                    Ok(repository) => repository.execute(Operation::Github { request }).await?,
                    Err(error) if request.repository.is_some() => {
                        if !repository_scope.permits_unbound_github(&cli.repo)? {return Err(error).context("Saved repository scope is unavailable; an unbound GitHub credential was not selected");}
                        desktop_core::execute_github(&cli.repo,request).await?
                    },
                    Err(error) => return Err(error),
                }
            };
            println!("{}", serde_json::to_string(&output)?);
            std::process::exit(output["code"].as_i64().unwrap_or(1) as i32);
        }
        Action::Preferences{action}=>{
            let store=registry(cli.config)?.preferences();let value=match action{None=>store.read()?,Some(PreferencesAction::Set{patch})=>store.update(parse_request(&patch)?)?};println!("{}",serde_json::to_string(&value)?);Ok(())
        },
        Action::Config{global,action}=>{let scope=if global{desktop_core::ConfigScope::Global}else{desktop_core::ConfigScope::Local};let value=match action{None=>desktop_core::git_settings(&cli.repo,scope).await?,Some(ConfigAction::Set{key,value})=>desktop_core::set_git_setting(&cli.repo,scope,&key,Some(value)).await?,Some(ConfigAction::Unset{key})=>desktop_core::set_git_setting(&cli.repo,scope,&key,None).await?};println!("{}",serde_json::to_string(&value)?);Ok(())},
        Action::Worktree{action}=>{let operation=match action{None=>Operation::Worktrees,Some(WorktreeAction::Add{path,branch,new_branch,start})=>Operation::WorktreeAdd{path:git_path(path),branch,new_branch,start},Some(WorktreeAction::Remove{path,force})=>Operation::WorktreeRemove{path:git_path(path),force},Some(WorktreeAction::Move{from,to})=>Operation::WorktreeMove{from:git_path(from),to:git_path(to)},Some(WorktreeAction::Lock{path,reason})=>Operation::WorktreeLock{path:git_path(path),locked:true,reason},Some(WorktreeAction::Unlock{path})=>Operation::WorktreeLock{path:git_path(path),locked:false,reason:None},Some(WorktreeAction::Prune{apply})=>Operation::WorktreePrune{dry_run:!apply}};run_operation(&cli.repo, &repository_scope,operation,true).await},
        Action::Lfs { action } => {
            let operation = match action {
                None => Operation::LfsStatus { paths: Vec::new() },
                Some(LfsAction::Fetch {remote,refs,all,recent,refetch,dry_run,include,exclude}) => Operation::LfsTransfer {request:desktop_core::LfsTransferRequest::Fetch {remote,refs,all,recent,refetch,dry_run,include,exclude}},
                Some(LfsAction::Pull {remote,include,exclude}) => Operation::LfsTransfer {request:desktop_core::LfsTransferRequest::Pull {remote,include,exclude}},
                Some(LfsAction::Push {remote,refs,all,dry_run}) => Operation::LfsTransfer {request:desktop_core::LfsTransferRequest::Push {remote,refs,all,dry_run}},
                Some(LfsAction::Checkout {patterns}) => Operation::LfsCheckout {patterns:patterns.into_iter().map(git_path).collect()},
                Some(LfsAction::Track {patterns,filename,lockable,not_lockable}) => Operation::LfsTrack {patterns,filename,lockable:if lockable {Some(true)} else if not_lockable {Some(false)} else {None}},
                Some(LfsAction::Untrack {patterns}) => Operation::LfsUntrack {patterns},
                Some(LfsAction::ToolStatus) => Operation::LfsToolStatus,
                Some(LfsAction::Status { paths }) => Operation::LfsStatus { paths: paths.into_iter().map(git_path).collect() },
                Some(LfsAction::Install { global, force, skip_repo, skip_smudge }) => Operation::LfsInstall { scope: if global {desktop_core::LfsInstallScope::Global} else {desktop_core::LfsInstallScope::Local}, force, skip_repo, skip_smudge },
            };
            run_operation(&cli.repo, &repository_scope, operation, true).await
        },
        Action::Submodule{action}=>{let operation=match action{None=>Operation::Submodules,Some(SubmoduleAction::Add{url,path,name})=>Operation::SubmoduleAdd{url,path:GitPath::Text(path),name},Some(SubmoduleAction::Update{paths,no_recursive})=>Operation::SubmoduleUpdate{paths:paths.into_iter().map(GitPath::Text).collect(),recursive:!no_recursive},Some(SubmoduleAction::Sync{paths,no_recursive})=>Operation::SubmoduleSync{paths:paths.into_iter().map(GitPath::Text).collect(),recursive:!no_recursive},Some(SubmoduleAction::Deinit{paths,force})=>Operation::SubmoduleDeinit{paths:paths.into_iter().map(GitPath::Text).collect(),force}};run_operation(&cli.repo, &repository_scope,operation,true).await},
        Action::Repositories { action } => {
            let registry = registry(cli.config)?;
            let data = match action {
                RegistryAction::List => registry.read()?,
                RegistryAction::Add { path, select } => {
                    let repo = Repository::open(&path).await?;
                    registry.add(repo.path().to_owned(), select)?
                }
                RegistryAction::Select { path } => {
                    let repo = Repository::open(&path).await?;
                    registry.select(repo.path().to_owned())?
                }
                RegistryAction::Forget { path } => {
                    // Missing repositories can still be forgotten by their saved absolute path.
                    registry.forget(&path.canonicalize().unwrap_or(path))?
                }
            };
            println!("{}", serde_json::to_string(&data.public_view()?)?);
            Ok(())
        }
        Action::Init { path } => {
            let repo = desktop_core::initialize(&path).await?;
            println!(
                "{}",
                serde_json::to_string(&registry(cli.config)?.add(repo.path().to_owned(), true)?.public_view()?)?
            );
            Ok(())
        }
        Action::Clone { url, path } => {
            let repo = desktop_core::clone_repository(&url, &path).await?;
            println!(
                "{}",
                serde_json::to_string(&registry(cli.config)?.add(repo.path().to_owned(), true)?.public_view()?)?
            );
            Ok(())
        }
        Action::Git { args } => forward("git", args, cli.repo),
        Action::Gh { args } => forward("gh", args, cli.repo),
        Action::Status { json } => run_operation(&cli.repo, &repository_scope, Operation::Status, json).await,
        Action::History { revision,offset,limit } => run_operation(&cli.repo, &repository_scope,Operation::History{revision,offset,limit},true).await,
        Action::Show { commit,path,parent } => run_operation(&cli.repo, &repository_scope,match path {Some(path)=>Operation::CommitDiff{path:GitPath::Text(path),commit,parent},None=>Operation::CommitFiles{commit,parent}},true).await,
        Action::Branches => run_operation(&cli.repo, &repository_scope,Operation::BranchList,true).await,
        Action::UpstreamSetup {preview,basis} => run_operation(&cli.repo, &repository_scope,if preview{Operation::UpstreamSetupPreview}else{Operation::SetupUpstream{basis}},true).await,
        Action::RepositoryContext {refresh,target,basis} => {
            let operation=if refresh {Operation::RefreshRepositoryContext} else if let Some(target)=target {Operation::SetForkContributionTarget{target:if target=="self"{desktop_core::ForkContributionTarget::Self_}else{desktop_core::ForkContributionTarget::Parent},basis}}else{Operation::RepositoryContext};
            run_operation(&cli.repo, &repository_scope,operation,true).await
        },
        Action::BranchPolicy => run_operation(&cli.repo, &repository_scope,Operation::BranchPolicy,true).await,
        Action::BranchNameRules { name } => run_operation(&cli.repo, &repository_scope,Operation::BranchNameRules { name },true).await,
        Action::Conflict { path } => run_operation(&cli.repo, &repository_scope,Operation::ConflictDetail{path:git_path(path)},true).await,
        Action::ResolveConflict { path,choice,basis } => run_operation(&cli.repo, &repository_scope,serde_json::from_value(serde_json::json!({"method":"resolve_conflict","path":git_path(path),"choice":choice,"basis":basis}))?,true).await,
        Action::Merge { branch } => run_operation(&cli.repo, &repository_scope, Operation::Merge { branch }, true).await,
        Action::Rebase { branch } => run_operation(&cli.repo, &repository_scope, Operation::Rebase { branch }, true).await,
        Action::CherryPick { commit, mainline } => run_operation(&cli.repo, &repository_scope, Operation::CherryPick { commit, mainline }, true).await,
        Action::Revert { commit, mainline } => run_operation(&cli.repo, &repository_scope, Operation::Revert { commit, mainline }, true).await,
        Action::Recover { kind,action } => run_operation(&cli.repo, &repository_scope,serde_json::from_value(serde_json::json!({"method":"recover","kind":kind,"action":action}))?,true).await,
        Action::Snapshot => run_operation(&cli.repo, &repository_scope, Operation::Snapshot, true).await,
        Action::Stage { paths } => {
            run_operation(
                &cli.repo,
                &repository_scope,
                Operation::Stage {
                    paths: paths.into_iter().map(GitPath::Text).collect(),
                },
                true,
            )
            .await
        }
        Action::Unstage { paths } => {
            run_operation(
                &cli.repo,
                &repository_scope,
                Operation::Unstage {
                    paths: paths.into_iter().map(GitPath::Text).collect(),
                },
                true,
            )
            .await
        }
        Action::CommitPreview => run_operation(&cli.repo, &repository_scope, Operation::CommitPreview, true).await,
        Action::Commit {
            summary,
            description,
            allow_large_files,
            basis,
        } => {
            run_operation(
                &cli.repo,
                &repository_scope,
                Operation::Commit {
                    summary,
                    description,
                    allow_large_files,
                    basis,
                },
                true,
            )
            .await
        }
        Action::CheckoutHistory => run_operation(&cli.repo, &repository_scope,Operation::CheckoutHistory,true).await,
        Action::CheckoutAcknowledge {receipt_id} => run_operation(&cli.repo, &repository_scope,Operation::AcknowledgeCheckout {receipt_id},true).await,
        Action::Checkout { branch,preview,strategy,basis,replace_stash,restore_index,open_worktree } => {
            if preview { return run_operation(&cli.repo, &repository_scope,Operation::CheckoutPreview {branch},true).await; }
            if open_worktree {
                let repository=repository_scope.open(&cli.repo).await?;
                let plan=repository.execute(Operation::CheckoutPreview {branch:branch.clone()}).await?;
                if !plan["occupied_worktree"].is_null() {
                    let path=desktop_core::directory_path(serde_json::from_value(plan["occupied_worktree"]["path"].clone())?)?;
                    let existing=Repository::open(&path).await?;
                    let snapshot=existing.execute(Operation::Snapshot).await?;
                    anyhow::ensure!(snapshot["head"]==plan["target"]["oid"] && snapshot["branch"]==plan["target"]["branch"],"Registered worktree changed; review checkout again");
                    repository.open_worktree(git_path(path)).await?;
                    let selected=registry(cli.config)?.read()?.public_view()?;
                    println!("{}",serde_json::to_string(&serde_json::json!({"code":0,"worktree_selected":selected}))?);
                    return Ok(());
                }
            }
            let strategy=match strategy.as_deref() {
                Some("leave")=>desktop_core::ChangesStrategy::StashOnCurrentBranch,
                Some("bring")=>desktop_core::ChangesStrategy::MoveToNewBranch,
                Some("ask")=>desktop_core::ChangesStrategy::AskForConfirmation,
                _=>registry(cli.config)?.preferences().read()?.uncommitted_changes,
            };
            let operation=Operation::Checkout {branch,strategy,basis,replace_stash,restore_index};
            run_operation(&cli.repo, &repository_scope,operation,true).await
        }
        Action::RenameBranch {name,new_name,preview,basis} => run_operation(&cli.repo, &repository_scope,if preview {Operation::RenameBranchPreview {name,new_name}} else {Operation::RenameBranch {name,new_name,basis}},true).await,
        Action::BranchRenameHistory => run_operation(&cli.repo, &repository_scope,Operation::BranchRenameHistory,true).await,
        Action::BranchRenameAcknowledge {receipt_id} => run_operation(&cli.repo, &repository_scope,Operation::AcknowledgeBranchRename {receipt_id},true).await,
        Action::DeleteBranch {name,to_checkout,preview,force,strategy,basis,replace_stash,restore_index,include_upstream,fetch_upstream_backup,expected_upstream} => {
            let upstream=include_upstream.then(||desktop_core::UpstreamDeletion{expected:(!expected_upstream.is_empty()).then(||expected_upstream.into_iter().map(|oid|if oid=="missing" {None}else{Some(oid)}).collect()),fetch_backup:fetch_upstream_backup});
            if preview {return run_operation(&cli.repo, &repository_scope,Operation::DeleteBranchPreview {name,to_checkout,upstream},true).await;}
            let strategy=match strategy.as_deref() {
                Some("ask")=>desktop_core::ChangesStrategy::AskForConfirmation,
                Some("leave")=>desktop_core::ChangesStrategy::StashOnCurrentBranch,
                Some("bring")=>desktop_core::ChangesStrategy::MoveToNewBranch,
                None=>{
                    let plan=repository_scope.open(&cli.repo).await?.execute(Operation::DeleteBranchPreview {name:name.clone(),to_checkout:to_checkout.clone(),upstream:None}).await?;
                    if plan["checkout"].is_null() {desktop_core::ChangesStrategy::AskForConfirmation} else {registry(cli.config)?.preferences().read()?.uncommitted_changes}
                },
                _=>unreachable!("validated strategy"),
            };
            run_operation(&cli.repo, &repository_scope,Operation::DeleteBranch {name,to_checkout,force,strategy,basis,replace_stash,restore_index,upstream},true).await
        },
        Action::RemoteDeletionTargets => run_operation(&cli.repo, &repository_scope,Operation::RemoteDeletionTargets,true).await,
        Action::DeleteRemoteBranch {remote,branch,preview,basis,expected,fetch_backup} => {
            let expected=(!expected.is_empty()).then(||expected.into_iter().map(|oid|if oid=="missing" {None} else {Some(oid)}).collect());
            let request=desktop_core::RemoteBranchDeletion {remote,branch,expected,fetch_backup};
            run_operation(&cli.repo, &repository_scope,if preview {Operation::RemoteBranchDeletePreview {request}} else {Operation::DeleteRemoteBranch {request,basis}},true).await
        },
        Action::RemoteDeletionHistory => run_operation(&cli.repo, &repository_scope,Operation::RemoteDeletionHistory,true).await,
        Action::RestoreRemoteTip {receipt_id,endpoint,name} => run_operation(&cli.repo, &repository_scope,Operation::RestoreRemoteTip {receipt_id,endpoint,name},true).await,
        Action::ForgetRemoteDeletion {receipt_id} => run_operation(&cli.repo, &repository_scope,Operation::ForgetRemoteDeletion {receipt_id},true).await,
        Action::DeletedBranches => run_operation(&cli.repo, &repository_scope,Operation::DeletedBranches,true).await,
        Action::RestoreBranch {receipt_id,name} => run_operation(&cli.repo, &repository_scope,Operation::RestoreDeletedBranch {receipt_id,name},true).await,
        Action::ForgetDeletedBranch {receipt_id} => run_operation(&cli.repo, &repository_scope,Operation::ForgetDeletedBranch {receipt_id},true).await,
        Action::CreateBranch { name,start_point,no_track,checkout,preview,strategy,basis,replace_stash,restore_index } => {
            if preview { return run_operation(&cli.repo, &repository_scope,Operation::CreateBranchPreview {name,start_point,no_track,checkout},true).await; }
            let strategy=match strategy.as_deref() {
                Some("ask")=>desktop_core::ChangesStrategy::AskForConfirmation,
                Some("leave")=>desktop_core::ChangesStrategy::StashOnCurrentBranch,
                Some("bring")=>desktop_core::ChangesStrategy::MoveToNewBranch,
                None if checkout=>registry(cli.config)?.preferences().read()?.uncommitted_changes,
                None=>desktop_core::ChangesStrategy::AskForConfirmation,
                _=>unreachable!("validated strategy"),
            };
            run_operation(&cli.repo, &repository_scope,Operation::CreateBranch {name,start_point,no_track,checkout,strategy,basis,replace_stash,restore_index},true).await
        }
        Action::Diff { staged, path, json } => {
            let operation =
                if json {
                    Operation::DiffDetail {
                        path: GitPath::Text(path.ok_or_else(|| {
                            anyhow::anyhow!("structured diff requires a file path")
                        })?),
                        staged,
                    }
                } else {
                    Operation::Diff {
                        staged,
                        path: path.map(GitPath::Text),
                    }
                };
            run_operation(&cli.repo, &repository_scope, operation, json).await
        }
        Action::SelectLines {
            path,
            staged,
            basis,
            lines,
        } => {
            run_operation(
                &cli.repo,
                &repository_scope,
                Operation::SelectDiff {
                    path: GitPath::Text(path),
                    staged,
                    basis,
                    lines,
                },
                true,
            )
            .await
        }
        Action::DiscardPreview {path, working_tree, lines, diff_basis} => {
            let (scope, selection) = discard_selection(working_tree, lines, diff_basis);
            run_operation(&cli.repo, &repository_scope, Operation::DiscardPreview { path: GitPath::Text(path), scope, selection }, true).await
        },
        Action::Discard {path, basis, working_tree, lines, diff_basis} => {
            let (scope, selection) = discard_selection(working_tree, lines, diff_basis);
            run_operation(&cli.repo, &repository_scope, Operation::Discard { path: GitPath::Text(path), scope, selection, basis }, true).await
        },
        Action::DiscardForget { id } => run_operation(&cli.repo, &repository_scope, Operation::ForgetDiscard { undo_id: id }, true).await,
        Action::DiscardUndo {id} => run_operation(&cli.repo, &repository_scope, id.map_or(Operation::ListDiscards, |id|Operation::UndoDiscard { undo_id: id }), true).await,
        Action::Fetch { remote } => {
            run_operation(&cli.repo, &repository_scope, Operation::Fetch { remote }, true).await
        }
        Action::Pull { remote, branch } => {
            run_operation(&cli.repo, &repository_scope, Operation::Pull { remote, branch }, true).await
        }
        Action::Push {
            remote,
            branch,
            set_upstream,
        } => {
            run_operation(
                &cli.repo,
                &repository_scope,
                Operation::Push {
                    remote,
                    branch,
                    set_upstream,
                },
                true,
            )
            .await
        }
        Action::StageConflict {path,basis,allow_markers} => run_operation(&cli.repo, &repository_scope, Operation::StageConflict {path:git_path(path),basis,allow_markers},true).await,
        Action::Repo { request } => run_operation(&cli.repo, &repository_scope, parse_request(&request)?, true).await,
        Action::Serve { port, empty } => {
            desktop_bridge::serve(
                if empty {
                    None
                } else {
                    Some(repository_scope.open(&cli.repo).await?)
                },
                registry(cli.config)?,
                port,
            )
            .await
        }
    }
}

fn parse_request<T: serde::de::DeserializeOwned>(request: &str) -> Result<T> {
    if request != "-" {
        return Ok(serde_json::from_str(request)?);
    }
    use std::io::Read;
    const LIMIT: u64 = 2 * 1024 * 1024;
    let mut bytes = Vec::new();
    std::io::stdin().take(LIMIT + 1).read_to_end(&mut bytes)?;
    if bytes.len() > LIMIT as usize {
        anyhow::bail!("JSON request exceeds 2 MiB");
    }
    Ok(serde_json::from_slice(&bytes)?)
}

fn registry(config: Option<PathBuf>) -> Result<desktop_core::Registry> {
    Ok(desktop_core::Registry::new(match config {
        Some(path) => path,
        None => desktop_core::Registry::default_path()?,
    }))
}

async fn run_operation(
    repo: &std::path::Path,
    scope: &CliRepositoryScope,
    operation: Operation,
    json: bool,
) -> Result<()> {
    if matches!(
        &operation,
        Operation::PublishContinuePreview { .. } | Operation::PublishContinue { .. }
    ) {
        desktop_core::publication_config_preflight(repo).await?;
    }
    let output = match operation {
        Operation::LfsToolStatus => desktop_core::lfs_tool_status(repo).await?,
        Operation::LfsInstall {
            scope: desktop_core::LfsInstallScope::Global,
            force,
            skip_repo: true,
            skip_smudge,
        } => {
            desktop_core::lfs_install(
                repo,
                desktop_core::LfsInstallScope::Global,
                force,
                true,
                skip_smudge,
            )
            .await?
        }
        Operation::LfsStatus { paths } if paths.is_empty() => match scope.open(repo).await {
            Ok(repository) => repository.execute(Operation::LfsStatus { paths }).await?,
            Err(_) => desktop_core::lfs_tool_status(repo).await?,
        },
        operation => scope.open(repo).await?.execute(operation).await?,
    };
    if json {
        println!("{}", serde_json::to_string(&output)?);
    } else {
        print!("{}", output["stdout"].as_str().unwrap_or(""));
        eprint!("{}", output["stderr"].as_str().unwrap_or(""));
    }
    let code = output.get("code").and_then(|v| v.as_i64()).unwrap_or(0);
    std::process::exit(i32::try_from(code).unwrap_or(1));
}

fn forward(program: &str, args: Vec<OsString>, repo: PathBuf) -> Result<()> {
    let mut command = Command::new(program);
    command.args(args).current_dir(repo);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        Err(command.exec().into())
    }
    #[cfg(not(unix))]
    std::process::exit(command.status()?.code().unwrap_or(1));
}

fn discard_selection(
    working_tree: bool,
    lines: Option<Vec<usize>>,
    basis: Option<String>,
) -> (
    desktop_core::DiscardScope,
    Option<desktop_core::DiscardSelection>,
) {
    let scope = if working_tree || lines.is_some() {
        desktop_core::DiscardScope::WorkingTree
    } else {
        desktop_core::DiscardScope::AllChanges
    };
    (
        scope,
        lines.map(|lines| desktop_core::DiscardSelection {
            lines,
            basis: basis.unwrap_or_default(),
        }),
    )
}

#[cfg(test)]
mod account_scope_tests {
    use super::*;
    #[test]
    fn explicit_repository_fallback_cannot_discard_saved_or_invalid_assignment_scope() {
        let directory = std::env::temp_dir().join(format!("desktop-cli-scope-{}", uuid_for_test()));
        std::fs::create_dir_all(directory.join("saved/subdir")).unwrap();
        let registry = desktop_core::Registry::new(directory.join("repositories.json"));
        registry.add(directory.join("saved"), false).unwrap();
        let scope = CliRepositoryScope {
            registry: Some(registry.clone()),
            record_id: None,
        };
        assert!(
            !scope
                .permits_unbound_github(&directory.join("saved/subdir"))
                .unwrap()
        );
        assert!(
            scope
                .permits_unbound_github(&directory.join("unrelated"))
                .unwrap()
        );
        let fixed = CliRepositoryScope {
            registry: Some(registry),
            record_id: Some("retained-record".into()),
        };
        assert!(
            !fixed
                .permits_unbound_github(&directory.join("unrelated"))
                .unwrap()
        );
        std::fs::write(directory.join("repositories.json"), b"invalid registry").unwrap();
        assert!(
            scope
                .permits_unbound_github(&directory.join("unrelated"))
                .is_err()
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
    fn uuid_for_test() -> String {
        format!(
            "{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        )
    }
}
