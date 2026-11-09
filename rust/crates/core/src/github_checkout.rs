//! Assigned-account PR checkout keeps API credentials out of Git descendants.
use crate::{
    ChangesStrategy, Repository, RepositoryIdentity, args,
    cancellation::Cancellation,
    github_api::{Request, Session},
    process,
    stash::checkout::CreationRequest,
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Arc,
};

struct PullHead {
    branch: String,
    oid: String,
    owner: Option<String>,
    repository: Option<RepositoryIdentity>,
    repository_spelling: Option<(String, String)>,
    base_default: Option<String>,
    maintainer_can_modify: bool,
}

impl PullHead {
    fn local_branch(&self, known_head_remote: bool) -> Result<String> {
        if !known_head_remote && self.base_default.as_deref() == Some(self.branch.as_str()) {
            let owner = self
                .owner
                .as_deref()
                .context("Pull request head owner is missing")?;
            Ok(format!("{owner}/{}", self.branch))
        } else {
            Ok(self.branch.clone())
        }
    }
}

fn pull_head(number: u64, repository: &RepositoryIdentity, value: &Value) -> Result<PullHead> {
    ensure!(
        number > 0 && value["number"].as_u64() == Some(number),
        "GitHub returned another pull request"
    );
    let base = &value["base"]["repo"];
    ensure!(
        base["id"].as_u64().is_some_and(|id| id > 0)
            && base["full_name"].as_str().is_some_and(|name| name
                .eq_ignore_ascii_case(&format!("{}/{}", repository.owner, repository.name)))
            && RepositoryIdentity::from_url(
                base["html_url"]
                    .as_str()
                    .context("Pull request base repository URL is missing")?
            )? == *repository,
        "Pull request base repository does not match the selected repository"
    );
    let head = &value["head"];
    let name = head["ref"]
        .as_str()
        .context("Pull request branch name is missing")?;
    ensure!(
        !name.is_empty()
            && name.len() <= 8192
            && !name.starts_with('-')
            && !name.contains("@{")
            && !name.chars().any(char::is_control),
        "Pull request branch name is invalid"
    );
    let oid = head["sha"]
        .as_str()
        .context("Pull request head object ID is missing")?;
    ensure!(
        matches!(oid.len(), 40 | 64) && oid.bytes().all(|byte| byte.is_ascii_hexdigit()),
        "Pull request head object ID is invalid"
    );
    let owner = head["repo"]["owner"]["login"]
        .as_str()
        .or_else(|| head["user"]["login"].as_str())
        .map(str::to_owned);
    if let Some(owner) = &owner {
        ensure!(
            !owner.is_empty()
                && owner.len() <= 256
                && owner
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || b"-_".contains(&byte)),
            "Pull request head owner is invalid"
        );
    }
    let head_repository = &head["repo"];
    // Older fixtures contain only an owner. Such partial metadata cannot grant
    // another transport destination; complete REST repository identity is proved.
    let identity = if ["id", "full_name", "html_url"]
        .iter()
        .any(|key| !head_repository[*key].is_null())
    {
        ensure!(
            head_repository["id"].as_u64().is_some_and(|id| id > 0),
            "Pull request head repository ID is invalid"
        );
        let identity = RepositoryIdentity::from_url(
            head_repository["html_url"]
                .as_str()
                .context("Pull request head repository URL is missing")?,
        )?;
        ensure!(
            identity.host == repository.host
                && head_repository["full_name"]
                    .as_str()
                    .is_some_and(|name| name
                        .eq_ignore_ascii_case(&format!("{}/{}", identity.owner, identity.name)))
                && owner
                    .as_ref()
                    .is_some_and(|owner| owner.eq_ignore_ascii_case(&identity.owner)),
            "Pull request head repository does not match its verified identity"
        );
        Some(identity)
    } else {
        None
    };
    let repository_spelling = if let Some(identity) = &identity {
        let (_, full_name) = head_repository["full_name"]
            .as_str()
            .context("Pull request head repository name is missing")?
            .split_once('/')
            .context("Pull request head repository name is invalid")?;
        let name = head_repository["name"].as_str().unwrap_or(full_name);
        ensure!(
            name.eq_ignore_ascii_case(&identity.name),
            "Pull request head repository name does not match its identity"
        );
        Some((
            owner
                .clone()
                .context("Pull request head owner is missing")?,
            name.to_owned(),
        ))
    } else {
        None
    };
    let maintainer_can_modify = match value.get("maintainer_can_modify") {
        None | Some(Value::Null) => false,
        Some(value) => value
            .as_bool()
            .context("Pull request maintainer permission is invalid")?,
    };
    ensure!(
        !maintainer_can_modify || identity.is_some() || head_repository.is_null(),
        "Pull request editable head repository is incomplete"
    );
    Ok(PullHead {
        branch: name.to_owned(),
        oid: oid.to_ascii_lowercase(),
        owner,
        repository: identity,
        repository_spelling,
        base_default: base["default_branch"].as_str().map(str::to_owned),
        maintainer_can_modify,
    })
}

fn pull_remote_url(
    repository: &RepositoryIdentity,
    protocol: &str,
    spelling: Option<(&str, &str)>,
) -> Result<String> {
    repository.validate()?;
    let (owner, name) = spelling.unwrap_or((&repository.owner, &repository.name));
    ensure!(
        owner.eq_ignore_ascii_case(&repository.owner)
            && name.eq_ignore_ascii_case(&repository.name),
        "Pull request tracking URL does not match its verified identity"
    );
    match protocol {
        "https" => Ok(format!(
            "{}://{}/{}/{}.git",
            if repository.host == "github.localhost" {
                "http"
            } else {
                "https"
            },
            repository.host,
            owner,
            name
        )),
        "ssh" => {
            let user = repository.host.strip_suffix(".ghe.com").unwrap_or("git");
            ensure!(
                !user.is_empty() && !repository.host.contains(':'),
                "GitHub SSH tracking host is unsupported"
            );
            Ok(format!("{user}@{}:{}/{}.git", repository.host, owner, name))
        }
        _ => anyhow::bail!("GitHub Git protocol must be https or ssh"),
    }
}

const PULL_CONFIG_LIMIT: u64 = 8 * 1024 * 1024;
const TRACKING_CHANGED: &str =
    "Pull request branch settings changed; existing settings were preserved";

struct PullTracking {
    remote: String,
    merge: String,
    protocol: Option<String>,
    config: PullConfig,
}

struct PullConfig {
    path: PathBuf,
    bytes: Vec<u8>,
    permissions: fs::Permissions,
}

fn pull_config_file(path: &Path) -> Result<(Vec<u8>, fs::Permissions)> {
    let mut options = fs::OpenOptions::new();
    options.read(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    ensure!(
        fs::symlink_metadata(path)
            .is_ok_and(|metadata| metadata.is_file() && !metadata.file_type().is_symlink()),
        "Pull request tracking requires a regular local Git configuration"
    );
    let file = options
        .open(path)
        .map_err(|_| anyhow::anyhow!(TRACKING_CHANGED))?;
    let metadata = file
        .metadata()
        .map_err(|_| anyhow::anyhow!(TRACKING_CHANGED))?;
    ensure!(
        metadata.is_file() && metadata.len() <= PULL_CONFIG_LIMIT,
        "Local Git configuration exceeds pull request tracking limits"
    );
    let mut bytes = Vec::new();
    file.take(PULL_CONFIG_LIMIT + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| anyhow::anyhow!(TRACKING_CHANGED))?;
    ensure!(
        bytes.len() as u64 <= PULL_CONFIG_LIMIT,
        "Local Git configuration exceeds pull request tracking limits"
    );
    Ok((bytes, metadata.permissions()))
}

fn pull_lock_absent(path: &Path) -> Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(_) => Ok(false),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(_) => anyhow::bail!(TRACKING_CHANGED),
    }
}

impl PullConfig {
    fn capture(path: &Path) -> Result<Self> {
        let (bytes, permissions) = pull_config_file(path)?;
        Ok(Self {
            path: path.to_owned(),
            bytes,
            permissions,
        })
    }
    fn current(&self) -> Result<()> {
        let (bytes, permissions) = pull_config_file(&self.path)?;
        ensure!(
            bytes == self.bytes && permissions == self.permissions,
            TRACKING_CHANGED
        );
        Ok(())
    }
    fn lock(self) -> Result<PullConfigLock> {
        self.current()?;
        let path = self.path.with_extension("lock");
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&path).map_err(|_| anyhow::anyhow!("Cannot lock pull request branch settings; retry after other Git configuration changes finish"))?;
        let mut lock = PullConfigLock {
            original: self,
            path,
            nested_owned: false,
            published: false,
        };
        ensure!(
            pull_lock_absent(&lock.path.with_extension("lock.lock"))?,
            "Another Git configuration edit is active"
        );
        lock.nested_owned = true;
        lock.original.current()?;
        file.write_all(&lock.original.bytes)
            .map_err(|_| anyhow::anyhow!("Cannot prepare pull request branch settings"))?;
        file.sync_all()
            .map_err(|_| anyhow::anyhow!("Cannot prepare pull request branch settings"))?;
        Ok(lock)
    }
}

struct PullConfigLock {
    original: PullConfig,
    path: PathBuf,
    nested_owned: bool,
    published: bool,
}
impl PullConfigLock {
    fn publish(mut self) -> Result<()> {
        self.original.current()?;
        let _ = pull_config_file(&self.path)?;
        let nested = self.path.with_extension("lock.lock");
        ensure!(
            pull_lock_absent(&nested)?,
            "Pull request branch settings edit did not finish"
        );
        // Windows FlushFileBuffers requires a writable handle. Open while the
        // operation-owned copy is private and writable, flush, then restore the
        // caller's permissions before publishing that same reviewed copy.
        let mut options = fs::OpenOptions::new();
        options.read(true).write(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
        }
        let file = options
            .open(&self.path)
            .map_err(|_| anyhow::anyhow!("Cannot finish pull request branch settings"))?;
        file.sync_all()
            .map_err(|_| anyhow::anyhow!("Cannot finish pull request branch settings"))?;
        file.set_permissions(self.original.permissions.clone())
            .map_err(|_| anyhow::anyhow!("Cannot preserve Git configuration permissions"))?;
        drop(file);
        self.original.current()?;
        fs::rename(&self.path, &self.original.path)
            .map_err(|_| anyhow::anyhow!("Cannot publish pull request branch settings"))?;
        self.published = true;
        #[cfg(unix)]
        if let Some(parent) = self.original.path.parent() {
            fs::File::open(parent).and_then(|file| file.sync_all()).map_err(|_| anyhow::anyhow!("Pull request branch settings were written; inspect Git configuration before retrying"))?;
        }
        Ok(())
    }
}
impl Drop for PullConfigLock {
    fn drop(&mut self) {
        if !self.published {
            if self.nested_owned {
                let _ = fs::remove_file(self.path.with_extension("lock.lock"));
            }
            let _ = fs::remove_file(&self.path);
        }
    }
}

struct PullHookDirectory(PathBuf);
impl Drop for PullHookDirectory {
    fn drop(&mut self) {
        if fs::symlink_metadata(&self.0)
            .is_ok_and(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
}

fn github_output(mut output: Value) -> Value {
    output["data"] = Value::Null;
    if output.get("hint").is_none() {
        output["hint"] = Value::Null;
    }
    output
}

impl Repository {
    pub(crate) async fn pull_request_remote(
        &self,
        identity: &RepositoryIdentity,
    ) -> Result<String> {
        self.find_pull_request_remote(identity).await?.context("Add a fetch remote for the selected pull request base repository before checking it out")
    }

    /// Resolve an existing declared fetch remote for the selected PR base.
    /// The saved source is preferred; explicit parent selectors may use an
    /// already configured upstream, with native URL rewriting retained.
    async fn find_pull_request_remote(
        &self,
        identity: &RepositoryIdentity,
    ) -> Result<Option<String>> {
        identity.validate()?;
        let binding = self.selected_binding().await?;
        if binding.identity.as_ref() == Some(identity) {
            return Ok(binding.remote);
        }
        let output = self.run(&args(&["remote"])).await?;
        ensure!(
            output.code == 0,
            "Cannot inspect declared pull request fetch remotes"
        );
        let text = std::str::from_utf8(&output.stdout)
            .map_err(|_| anyhow::anyhow!("Cannot inspect declared pull request fetch remotes"))?;
        let remotes = text.lines().collect::<Vec<_>>();
        ensure!(
            remotes.len() <= 128,
            "Too many declared pull request fetch remotes"
        );
        for remote in remotes {
            ensure!(
                !remote.is_empty() && remote.len() <= 4096 && !remote.contains(['\0', '\r']),
                "Invalid declared pull request fetch remote"
            );
            let url = self
                .run(&args(&["remote", "get-url", "--", remote]))
                .await?;
            ensure!(
                url.code == 0,
                "Cannot resolve a declared pull request fetch remote"
            );
            let url = std::str::from_utf8(&url.stdout).map_err(|_| {
                anyhow::anyhow!("Cannot resolve a declared pull request fetch remote")
            })?;
            let url = url
                .strip_suffix('\n')
                .context("Cannot resolve a declared pull request fetch remote")?;
            ensure!(
                !url.contains(['\n', '\r', '\0']) && url.len() <= 16 * 1024,
                "Invalid declared pull request fetch URL"
            );
            if RepositoryIdentity::from_url(url).is_ok_and(|parsed| parsed == *identity) {
                return Ok(Some(remote.to_owned()));
            }
        }
        Ok(None)
    }

    /// Resolve a declared head remote when available, prove its exact API head,
    /// and reuse native reviewed branch workflows without token-bearing parents.
    pub(crate) async fn checkout_pull_request_assigned(
        &self,
        number: u64,
        session: &Arc<Session>,
        repository: &RepositoryIdentity,
        account_basis: &str,
    ) -> Result<Value> {
        ensure!(number > 0, "Pull request number must be positive");
        let base_remote = self.pull_request_remote(repository).await?;
        let data = session
            .get(Request::Pull { number })
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify the selected pull request"))?;
        let head = pull_head(number, repository, &data)?;
        self.validate_branch(&head.branch).await?;
        let head_remote = match &head.repository {
            Some(identity) => self.find_pull_request_remote(identity).await?,
            None => None,
        };
        let branch = head.local_branch(head_remote.is_some())?;
        self.validate_branch(&branch).await?;
        let configuration = self.pull_configuration().await?;
        let tracking = if head_remote.is_none() && self.pull_merge_missing(&branch).await? {
            let (remote, merge, protocol) = if head.maintainer_can_modify {
                if let Some(identity) = &head.repository {
                    let protocol = session.git_protocol().await?;
                    (
                        pull_remote_url(
                            identity,
                            &protocol,
                            head.repository_spelling
                                .as_ref()
                                .map(|(owner, name)| (owner.as_str(), name.as_str())),
                        )?,
                        format!("refs/heads/{}", head.branch),
                        Some(protocol),
                    )
                } else {
                    (
                        base_remote.clone(),
                        format!("refs/pull/{number}/head"),
                        None,
                    )
                }
            } else {
                (
                    base_remote.clone(),
                    format!("refs/pull/{number}/head"),
                    None,
                )
            };
            Some(PullTracking {
                remote,
                merge,
                protocol,
                config: PullConfig::capture(&self.common_directory().await?.join("config"))?,
            })
        } else {
            None
        };
        self.ensure_account_basis(account_basis).await?;
        let temporary = format!("refs/desktop/pr-checkout/{}", uuid::Uuid::new_v4());
        ensure!(
            self.pull_direct_ref(&temporary).await?.is_none(),
            "Cannot reserve a private pull request fetch ref"
        );
        let workflow = async {
            let result: Result<Value> = async {
                let start = if let Some(remote) = &head_remote {
                    let reference = format!("refs/remotes/{remote}/{}", head.branch);
                    let format = self.run(&args(&["check-ref-format", &reference])).await?;
                    ensure!(
                        format.code == 0,
                        "Pull request remote tracking ref is invalid"
                    );
                    let old = self.pull_direct_ref(&reference).await?;
                    self.ensure_pull_configuration(&configuration).await?;
                    ensure!(
                        self.find_pull_request_remote(
                            head.repository
                                .as_ref()
                                .context("Pull request head repository is missing")?
                        )
                        .await?
                        .as_ref()
                            == Some(remote),
                        "Pull request head remote changed; review again"
                    );
                    self.fetch_pull_head(
                        remote,
                        &format!("refs/heads/{}", head.branch),
                        &temporary,
                        &head.oid,
                    )
                    .await?;
                    self.ensure_account_basis(account_basis).await?;
                    self.ensure_pull_configuration(&configuration).await?;
                    self.publish_pull_remote_ref(&reference, old.as_deref(), &temporary, &head.oid)
                        .await?;
                    reference
                } else {
                    self.ensure_pull_configuration(&configuration).await?;
                    self.fetch_pull_head(
                        &base_remote,
                        &format!("refs/pull/{number}/head"),
                        &temporary,
                        &head.oid,
                    )
                    .await?;
                    temporary.clone()
                };
                self.ensure_account_basis(account_basis).await?;
                self.ensure_pull_configuration(&configuration).await?;
                let output = self
                    .checkout_pull_branch(
                        &branch,
                        &start,
                        head_remote.is_some(),
                        &head,
                        account_basis,
                    )
                    .await?;
                if output["code"] == 0
                    && let Some(tracking) = tracking
                {
                    if let Some(protocol) = &tracking.protocol {
                        ensure!(
                            session.git_protocol().await? == *protocol,
                            "GitHub Git protocol changed; review pull request tracking again"
                        );
                    }
                    self.apply_pull_tracking(&branch, &configuration, tracking, account_basis)
                        .await?;
                }
                Ok(output)
            }
            .await;
            let cleanup = Cancellation::default()
                .scope(self.remove_pull_fetch_ref(&temporary))
                .await;
            match (result, cleanup) {
                (Ok(output), Ok(())) => Ok(github_output(output)),
                (Err(error), _) => Err(error),
                (Ok(_), Err(error)) => Err(error),
            }
        };
        if let Some(remote) = &head_remote {
            crate::git_credentials::scope_checkout_head(self, remote, session, Box::pin(workflow))
                .await
        } else {
            workflow.await
        }
    }

    async fn pull_configuration(&self) -> Result<Vec<u8>> {
        let output = process::configuration(
            self.path(),
            &args(&["config", "--null", "--list", "--includes", "--show-origin"]),
        )
        .await?;
        ensure!(
            output.code == 0,
            "Cannot review pull request tracking settings"
        );
        Ok(output.stdout)
    }

    async fn ensure_pull_configuration(&self, expected: &[u8]) -> Result<()> {
        ensure!(
            self.pull_configuration().await? == expected,
            "Pull request remote or branch settings changed; review again"
        );
        Ok(())
    }

    async fn pull_merge_missing(&self, branch: &str) -> Result<bool> {
        // Match gh's first-line scalar query, including an explicit empty value.
        let output = process::configuration(
            self.path(),
            &args(&["config", "--get", &format!("branch.{branch}.merge")]),
        )
        .await?;
        ensure!(
            matches!(output.code, 0 | 1),
            "Cannot inspect pull request branch tracking"
        );
        Ok(output.code == 1
            || output
                .stdout
                .split(|byte| *byte == b'\n')
                .next()
                .is_none_or(|line| line.is_empty()))
    }

    async fn pull_direct_ref(&self, reference: &str) -> Result<Option<String>> {
        ensure!(
            self.run(&args(&["symbolic-ref", "--quiet", reference]))
                .await?
                .code
                == 1,
            "Pull request ref must remain direct"
        );
        let exists = self
            .run(&args(&["show-ref", "--verify", "--quiet", reference]))
            .await?;
        ensure!(
            matches!(exists.code, 0 | 1),
            "Cannot inspect pull request ref"
        );
        if exists.code == 1 {
            return Ok(None);
        }
        let value = self
            .run(&args(&["show-ref", "--verify", "--hash", reference]))
            .await?;
        ensure!(value.code == 0, "Pull request ref changed; review again");
        Ok(Some(String::from_utf8(value.stdout)?.trim().to_owned()))
    }

    async fn fetch_pull_head(
        &self,
        remote: &str,
        source: &str,
        temporary: &str,
        oid: &str,
    ) -> Result<()> {
        let refspec = format!("{source}:{temporary}");
        let fetched = self
            .run(&args(&[
                "fetch",
                "--no-tags",
                "--no-recurse-submodules",
                "--no-write-fetch-head",
                // A private explicit refspec must not opportunistically update
                // the canonical remote ref before its guarded CAS publication.
                "--refmap=",
                "--",
                remote,
                &refspec,
            ]))
            .await?;
        ensure!(
            fetched.code == 0,
            "Cannot fetch the verified pull request head; inspect the remote and retry"
        );
        ensure!(
            self.resolve_commit(temporary).await? == oid,
            "Pull request head changed while fetching; refresh before checking it out"
        );
        Ok(())
    }

    async fn publish_pull_remote_ref(
        &self,
        reference: &str,
        old: Option<&str>,
        temporary: &str,
        oid: &str,
    ) -> Result<()> {
        let directory = self.git_directory().await?.join("desktop-pr-checkout");
        let id = uuid::Uuid::new_v4().to_string();
        let _guard = PullHookDirectory(directory.join(format!("{id}.create-hooks")));
        let mut command = self
            .direct_ref_guard(&directory, &id, reference, oid, old, Some((temporary, oid)))
            .await?;
        let absent = "0".repeat(oid.len());
        command.extend(args(&[
            "update-ref",
            "--no-deref",
            "-m",
            "Desktop pull request head",
            reference,
            oid,
            old.unwrap_or(&absent),
        ]));
        let output = self.run(&command).await?;
        ensure!(
            output.code == 0,
            "Pull request remote tracking ref changed; review again"
        );
        Ok(())
    }

    async fn apply_pull_tracking(
        &self,
        branch: &str,
        configuration: &[u8],
        tracking: PullTracking,
        account_basis: &str,
    ) -> Result<()> {
        let _stash = self.stash_lock().await?;
        self.ensure_account_basis(account_basis).await?;
        self.ensure_pull_configuration(configuration).await?;
        ensure!(
            self.pull_merge_missing(branch).await?,
            "Pull request branch tracking changed; existing settings were preserved"
        );
        let reference = format!("refs/heads/{branch}");
        let current = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        ensure!(
            current.code == 0 && current.stdout.strip_suffix(b"\n") == Some(reference.as_bytes()),
            "Pull request branch changed before tracking was configured"
        );
        let oid = self.resolve_commit("HEAD").await?;
        let lock = tracking.config.lock()?;
        self.ensure_pull_configuration(configuration).await?;
        for (key, value) in [
            ("remote", tracking.remote.as_str()),
            ("pushRemote", tracking.remote.as_str()),
            ("merge", tracking.merge.as_str()),
        ] {
            let command = vec![
                "config".into(),
                "--file".into(),
                lock.path.as_os_str().to_owned(),
                "--replace-all".into(),
                "--".into(),
                format!("branch.{branch}.{key}").into(),
                value.into(),
            ];
            ensure!(
                self.run(&command).await?.code == 0,
                "Cannot prepare pull request branch tracking settings"
            );
        }
        self.ensure_account_basis(account_basis).await?;
        self.ensure_pull_configuration(configuration).await?;
        ensure!(
            self.pull_direct_ref(&reference).await?.as_deref() == Some(&oid),
            "Pull request branch changed before tracking was configured"
        );
        let current = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        ensure!(
            current.code == 0 && current.stdout.strip_suffix(b"\n") == Some(reference.as_bytes()),
            "Pull request checkout changed before tracking was configured"
        );
        lock.publish()?;
        Ok(())
    }

    async fn checkout_pull_branch(
        &self,
        branch: &str,
        start: &str,
        track_direct: bool,
        head: &PullHead,
        account_basis: &str,
    ) -> Result<Value> {
        self.ensure_account_basis(account_basis).await?;
        let reference = format!("refs/heads/{branch}");
        let symbolic = self
            .run(&args(&["symbolic-ref", "--quiet", &reference]))
            .await?;
        ensure!(
            symbolic.code == 1,
            "Pull request branch must be a direct local branch"
        );
        let exists = self
            .run(&args(&["show-ref", "--verify", "--quiet", &reference]))
            .await?;
        ensure!(
            matches!(exists.code, 0 | 1),
            "Cannot inspect the local pull request branch"
        );
        if exists.code == 1 {
            return self
                .create_branch_reviewed(
                    branch,
                    CreationRequest {
                        start_point: Some(start.into()),
                        no_track: !track_direct,
                        track_direct,
                        checkout: true,
                    },
                    ChangesStrategy::AskForConfirmation,
                    None,
                    false,
                    false,
                )
                .await;
        }
        let local = self
            .run(&args(&["show-ref", "--verify", "--hash", &reference]))
            .await?;
        ensure!(
            local.code == 0,
            "Local pull request branch changed; review again"
        );
        let old = String::from_utf8(local.stdout)?.trim().to_owned();
        let ancestor = self
            .run(&args(&["merge-base", "--is-ancestor", &old, &head.oid]))
            .await?;
        ensure!(
            matches!(ancestor.code, 0 | 1),
            "Cannot compare the local and remote pull request heads"
        );
        let update = old != head.oid && ancestor.code == 0;
        if ancestor.code == 1 {
            let ahead = self
                .run(&args(&["merge-base", "--is-ancestor", &head.oid, &old]))
                .await?;
            ensure!(
                ahead.code == 0,
                "The local pull request branch has diverged; review its commits before updating it"
            );
        }
        let preview = self.checkout_preview(&reference).await?;
        ensure!(
            preview["operation"].is_null() && preview["conflicted"] == false,
            "Finish or abort the current operation or conflicts before checking out a pull request"
        );
        if update && preview["dirty"] == true {
            return Ok(
                json!({"code":2,"stdout":"","stderr":"Commit or stash changes before updating the pull request branch","requires_confirmation":true,"preview":preview}),
            );
        }
        self.ensure_account_basis(account_basis).await?;
        let basis = preview["basis"]
            .as_str()
            .context("Pull request checkout review is missing")?;
        let mut output = self
            .checkout_reviewed(
                &reference,
                ChangesStrategy::AskForConfirmation,
                Some(basis),
                false,
                false,
            )
            .await?;
        if output["code"] != 0 || !update {
            return Ok(output);
        }
        self.ensure_account_basis(account_basis).await?;
        let current = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        ensure!(
            current.code == 0 && String::from_utf8(current.stdout)?.trim() == reference,
            "Pull request checkout changed before updating the branch"
        );
        ensure!(
            self.resolve_commit("HEAD").await? == old,
            "Local pull request branch changed before its fast-forward; review again"
        );
        let merged = process::run_checkout(
            self.path(),
            &args(&["merge", "--ff-only", "--no-edit", "--no-stat", "--", start]),
        )
        .await?
        .text();
        output["code"] = json!(merged.code);
        if merged.code == 0 {
            output["unchanged"] = json!(false);
        }
        for (key, suffix) in [("stdout", merged.stdout), ("stderr", merged.stderr)] {
            let mut text = output[key].as_str().unwrap_or_default().to_owned();
            text.push_str(&suffix);
            output[key] = json!(text);
        }
        Ok(output)
    }

    async fn remove_pull_fetch_ref(&self, reference: &str) -> Result<()> {
        let exists = self
            .run(&args(&["show-ref", "--verify", "--quiet", reference]))
            .await?;
        if exists.code == 1 {
            return Ok(());
        }
        ensure!(
            exists.code == 0,
            "Cannot inspect the temporary pull request fetch ref"
        );
        let existing = self
            .run(&args(&["show-ref", "--verify", "--hash", reference]))
            .await?;
        ensure!(
            existing.code == 0,
            "Temporary pull request fetch ref changed during cleanup"
        );
        let oid = String::from_utf8(existing.stdout)?.trim().to_owned();
        let deleted = self
            .run(&args(&["update-ref", "--no-deref", "-d", reference, &oid]))
            .await?;
        ensure!(
            deleted.code == 0,
            "Temporary pull request fetch ref changed; inspect it before retrying"
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn identity() -> RepositoryIdentity {
        RepositoryIdentity::from_url("https://github.com/base/repo").unwrap()
    }
    fn data() -> Value {
        json!({"number":7,"base":{"repo":{"id":70,"full_name":"base/repo","html_url":"https://github.com/base/repo","default_branch":"main"}},"head":{"ref":"feature","sha":"a".repeat(40),"repo":{"owner":{"login":"fork-owner"}}}})
    }
    #[test]
    fn pr_identity_and_head_are_bound_before_native_git() {
        let value = data();
        let parsed = pull_head(7, &identity(), &value).unwrap();
        assert_eq!(parsed.branch, "feature");
        assert_eq!(parsed.oid, "a".repeat(40));
        for (pointer, replacement) in [
            ("/number", json!(8)),
            ("/base/repo/id", json!(0)),
            ("/base/repo/full_name", json!("other/repo")),
            (
                "/base/repo/html_url",
                json!("https://other.example/base/repo"),
            ),
            ("/head/ref", json!("-unsafe")),
            ("/head/ref", json!("private\nvalue")),
            ("/head/sha", json!("short-private")),
        ] {
            let mut invalid = value.clone();
            *invalid.pointer_mut(pointer).unwrap() = replacement;
            assert!(pull_head(7, &identity(), &invalid).is_err(), "{pointer}");
        }
    }
    #[test]
    fn default_branch_heads_use_the_fork_owner_prefix() {
        let mut value = data();
        value["head"]["ref"] = json!("main");
        assert_eq!(
            pull_head(7, &identity(), &value)
                .unwrap()
                .local_branch(false)
                .unwrap(),
            "fork-owner/main"
        );
        value["head"]["repo"] = Value::Null;
        value["head"]["user"] = json!({"login":"deleted-fork-owner"});
        assert_eq!(
            pull_head(7, &identity(), &value)
                .unwrap()
                .local_branch(false)
                .unwrap(),
            "deleted-fork-owner/main"
        );
    }

    #[test]
    fn head_repository_identity_and_remote_protocol_are_fixed() {
        let mut value = data();
        value["head"]["repo"] = json!({"id":81,"full_name":"fork-owner/repo","html_url":"https://github.com/fork-owner/repo","owner":{"login":"fork-owner"}});
        value["head"]["ref"] = json!("main");
        value["maintainer_can_modify"] = json!(true);
        let head = pull_head(7, &identity(), &value).unwrap();
        assert_eq!(head.local_branch(true).unwrap(), "main");
        assert_eq!(head.local_branch(false).unwrap(), "fork-owner/main");
        assert!(head.maintainer_can_modify);
        assert_eq!(
            pull_remote_url(head.repository.as_ref().unwrap(), "https", None).unwrap(),
            "https://github.com/fork-owner/repo.git"
        );
        assert_eq!(
            pull_remote_url(head.repository.as_ref().unwrap(), "ssh", None).unwrap(),
            "git@github.com:fork-owner/repo.git"
        );
        let tenant = RepositoryIdentity::from_url("https://tenant.ghe.com/owner/repo").unwrap();
        assert_eq!(
            pull_remote_url(&tenant, "ssh", None).unwrap(),
            "tenant@tenant.ghe.com:owner/repo.git"
        );
        let mut mixed = value.clone();
        mixed["head"]["repo"] = json!({"id":82,"name":"RepoCase","full_name":"Fork-Owner/RepoCase","html_url":"https://github.com/Fork-Owner/RepoCase","owner":{"login":"Fork-Owner"}});
        let mixed = pull_head(7, &identity(), &mixed).unwrap();
        let spelling = mixed
            .repository_spelling
            .as_ref()
            .map(|(owner, name)| (owner.as_str(), name.as_str()));
        assert_eq!(
            pull_remote_url(mixed.repository.as_ref().unwrap(), "https", spelling).unwrap(),
            "https://github.com/Fork-Owner/RepoCase.git"
        );
        assert_eq!(
            pull_remote_url(mixed.repository.as_ref().unwrap(), "ssh", spelling).unwrap(),
            "git@github.com:Fork-Owner/RepoCase.git"
        );
        for (pointer, replacement) in [
            ("/head/repo/id", json!(0)),
            ("/head/repo/full_name", json!("other/repo")),
            (
                "/head/repo/html_url",
                json!("https://other.example/fork-owner/repo"),
            ),
            ("/maintainer_can_modify", json!("true")),
        ] {
            let mut invalid = value.clone();
            *invalid.pointer_mut(pointer).unwrap() = replacement;
            assert!(pull_head(7, &identity(), &invalid).is_err(), "{pointer}");
        }
    }

    struct ConfigFixture(PathBuf);
    impl ConfigFixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("desktop-pr-config-{}", uuid::Uuid::new_v4()));
            fs::create_dir(&root).unwrap();
            fs::write(root.join("config"),b"# caller comment\n[branch \"feature\"]\n remote = previous\n merge =\n gh-merge-base = main\n[desktop]\n unrelated = retained\n").unwrap();
            Self(root)
        }
        fn path(&self) -> PathBuf {
            self.0.join("config")
        }
        fn set(&self, path: &Path, key: &str, value: &str) {
            let output = std::process::Command::new("git")
                .args(["config", "--file"])
                .arg(path)
                .args(["--replace-all", "--", key, value])
                .output()
                .unwrap();
            assert!(output.status.success(), "native Git config staging failed");
        }
        fn get(&self, key: &str) -> String {
            let output = std::process::Command::new("git")
                .args(["config", "--file"])
                .arg(self.path())
                .args(["--get", key])
                .output()
                .unwrap();
            assert!(output.status.success());
            String::from_utf8(output.stdout)
                .unwrap()
                .trim_end_matches('\n')
                .to_owned()
        }
    }
    impl Drop for ConfigFixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn tracking_config_publishes_triplet_atomically_and_preserves_caller_keys() {
        let fixture = ConfigFixture::new();
        let path = fixture.path();
        let permissions = fs::metadata(&path).unwrap().permissions();
        let lock = PullConfig::capture(&path).unwrap().lock().unwrap();
        for (key, value) in [
            ("remote", "upstream"),
            ("pushRemote", "upstream"),
            ("merge", "refs/pull/7/head"),
        ] {
            fixture.set(&lock.path, &format!("branch.feature.{key}"), value);
        }
        assert_eq!(fixture.get("branch.feature.remote"), "previous");
        lock.publish().unwrap();
        assert_eq!(fixture.get("branch.feature.remote"), "upstream");
        assert_eq!(fixture.get("branch.feature.pushRemote"), "upstream");
        assert_eq!(fixture.get("branch.feature.merge"), "refs/pull/7/head");
        assert_eq!(fixture.get("branch.feature.gh-merge-base"), "main");
        assert_eq!(fixture.get("desktop.unrelated"), "retained");
        assert!(fs::read(&path).unwrap().starts_with(b"# caller comment\n"));
        assert_eq!(fs::metadata(&path).unwrap().permissions(), permissions);
        assert!(!path.with_extension("lock").exists());
        assert!(!path.with_extension("lock.lock").exists());
    }

    #[test]
    fn tracking_config_refuses_external_changes_and_preserves_foreign_locks() {
        let fixture = ConfigFixture::new();
        let path = fixture.path();
        let captured = PullConfig::capture(&path).unwrap();
        fixture.set(&path, "desktop.concurrent", "before-lock");
        assert!(captured.lock().is_err());
        let lock = PullConfig::capture(&path).unwrap().lock().unwrap();
        fixture.set(&lock.path, "branch.feature.remote", "intended");
        // A non-cooperating writer must also be detected after our lock exists.
        let changed = b"[desktop]\n concurrent = external writer\n";
        fs::write(&path, changed).unwrap();
        assert!(lock.publish().is_err());
        assert_eq!(fs::read(&path).unwrap(), changed);
        assert!(!path.with_extension("lock").exists());
        for (foreign, created) in [
            (path.with_extension("lock"), path.with_extension("lock")),
            (
                path.with_extension("lock.lock"),
                path.with_extension("lock"),
            ),
        ] {
            fs::write(&foreign, b"caller-owned lock").unwrap();
            assert!(PullConfig::capture(&path).unwrap().lock().is_err());
            assert_eq!(fs::read(&foreign).unwrap(), b"caller-owned lock");
            if foreign != created {
                assert!(!created.exists());
            }
            fs::remove_file(foreign).unwrap();
        }
    }

    #[cfg(unix)]
    #[test]
    fn tracking_config_refuses_symlinks_without_changing_their_targets() {
        use std::os::unix::fs::symlink;
        let fixture = ConfigFixture::new();
        let path = fixture.path();
        let target = fixture.0.join("caller-target");
        fs::rename(&path, &target).unwrap();
        let before = fs::read(&target).unwrap();
        symlink(&target, &path).unwrap();
        assert!(PullConfig::capture(&path).is_err());
        assert_eq!(fs::read(&target).unwrap(), before);
        fs::remove_file(&path).unwrap();
        fs::rename(&target, &path).unwrap();
        let nested = path.with_extension("lock.lock");
        symlink(fixture.0.join("absent"), &nested).unwrap();
        assert!(PullConfig::capture(&path).unwrap().lock().is_err());
        assert!(
            fs::symlink_metadata(&nested)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert!(!path.with_extension("lock").exists());
    }
}
