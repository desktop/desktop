//! Operation-scoped HTTPS credentials for saved repository accounts.
//! Secrets cross only a private helper pipe and an ephemeral authenticated loopback
//! connection. Neither this channel nor its capability is exposed to the web UI.
mod auth_sources;
mod endpoint;
mod intent;
mod lfs_storage;
pub(crate) mod protocol;

use crate::{
    AccountAssignment, Operation, Repository,
    cancellation::Cancellation,
    github_api::{ChosenAccount, Session},
    process::RawOutput,
};
use anyhow::{Context, Result, ensure};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use endpoint::Endpoint;
use serde::{Deserialize, Serialize};
use std::{future::Future, path::PathBuf, sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    process::Command,
    sync::Mutex,
    task::JoinSet,
};

const ADDRESS: &str = "DESKTOP_RS_GIT_BROKER";
const CAPABILITY: &str = "DESKTOP_RS_GIT_CAPABILITY";
const HELPER_EXE: &str = "DESKTOP_RS_CREDENTIAL_HELPER";
const HELPER: &str = "!f() { \"$DESKTOP_RS_CREDENTIAL_HELPER\" __credential-helper \"$@\"; }; f";
const MAX_FRAME: usize = 256 * 1024;
const REFUSED: &str = "Assigned Git credentials refused; select the repository account and retry";
const CHANGED: &str = "Repository account or destination changed; reload before retrying";

tokio::task_local! { static CURRENT: Arc<Lease>; static NATIVE_CONFIGURATION: bool; }

struct Lease {
    repository: Repository,
    basis: String,
    assignment: AccountAssignment,
    operation: Operation,
    checkout_head_remote: Option<String>,
    host: String,
    endpoints: Vec<Endpoint>,
    config: Vec<(String, String)>,
    logs_isolated: bool,
    address: String,
    capability: String,
    helper: PathBuf,
    cancellation: Cancellation,
    session: Mutex<Option<Arc<Session>>>,
    verified: Mutex<Vec<Endpoint>>,
}

struct LeaseSelection {
    basis: String,
    assignment: AccountAssignment,
    operation: Operation,
    checkout_head_remote: Option<String>,
    host: String,
    session: Option<Arc<Session>>,
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    capability: String,
    operation: String,
    directory: String,
    input: String,
}
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct Reply {
    output: String,
    error: Option<String>,
}
impl Reply {
    fn refused(message: &str) -> Self {
        Self {
            output: STANDARD.encode(protocol::refusal()),
            error: Some(message.to_owned()),
        }
    }
    fn output(bytes: &[u8]) -> Self {
        Self {
            output: STANDARD.encode(bytes),
            error: None,
        }
    }
}

/// Install a lazy lease even for local operations: hooks, filters and Git LFS
/// children must inherit the same policy without receiving a credential in env.
pub(crate) async fn scope<T>(
    repository: &Repository,
    operation: &Operation,
    work: impl Future<Output = Result<T>>,
) -> Result<T> {
    if !needs_credentials(operation) {
        return work.await;
    }
    let account = repository.account_store_state().await?;
    if matches!(account.view.assignment, AccountAssignment::Effective {}) {
        return work.await;
    }
    let version = crate::process::run(repository.path(), &crate::args(&["--version"])).await?;
    ensure!(
        version.code == 0 && supported_git(&version.stdout),
        "Assigned HTTPS credentials require Git 2.46 or newer"
    );
    let binding = repository.selected_binding().await?;
    let host = match &account.view.assignment {
        AccountAssignment::Assigned { host, .. } => Some(host.clone()),
        AccountAssignment::None {} => binding.identity.map(|identity| identity.host),
        AccountAssignment::Effective {} => unreachable!(),
    };
    let Some(host) = host else {
        return work.await;
    };
    let basis = repository.account_state().await?.view.basis;
    scope_selected(
        repository,
        LeaseSelection {
            basis,
            assignment: account.view.assignment,
            operation: operation.clone(),
            checkout_head_remote: None,
            host,
            session: None,
        },
        work,
    )
    .await
}

/// Extend only a proved PR checkout with its existing declared head remote.
/// Its fetch, branch switch and native hooks share the captured account session.
pub(crate) async fn scope_checkout_head<T>(
    repository: &Repository,
    remote: &str,
    session: &Arc<Session>,
    work: impl Future<Output = Result<T>>,
) -> Result<T> {
    let parent = CURRENT
        .try_with(Clone::clone)
        .context("Pull request checkout credential scope is missing")?;
    ensure!(
        parent.repository.path() == repository.path()
            && matches!(&parent.assignment, AccountAssignment::Assigned { .. })
            && parent.checkout_head_remote.is_none()
            && matches!(&parent.operation, Operation::Github { request } if matches!(request.action, crate::GitHubAction::CheckoutPullRequest { .. })),
        "Pull request head credentials require the original repository checkout scope"
    );
    parent.cancellation.check()?;
    parent.check_current().await?;
    let captured = {
        let saved = parent.session.lock().await;
        saved
            .as_ref()
            .cloned()
            .context("Pull request checkout account session is missing")?
    };
    ensure!(
        Arc::ptr_eq(&captured, session),
        "Pull request checkout account session changed"
    );
    parent.cancellation.check()?;
    scope_selected(
        &parent.repository,
        LeaseSelection {
            basis: parent.basis.clone(),
            assignment: parent.assignment.clone(),
            operation: parent.operation.clone(),
            checkout_head_remote: Some(remote.to_owned()),
            host: parent.host.clone(),
            session: Some(captured),
        },
        work,
    )
    .await
}

async fn scope_selected<T>(
    repository: &Repository,
    selection: LeaseSelection,
    work: impl Future<Output = Result<T>>,
) -> Result<T> {
    let LeaseSelection {
        basis,
        assignment,
        operation,
        checkout_head_remote,
        host,
        session,
    } = selection;
    let endpoints = intent::collect(
        repository,
        &operation,
        &host,
        checkout_head_remote.as_deref(),
    )
    .await?;
    auth_sources::check(repository.path(), &endpoints).await?;
    let entries = auth_sources::config_entries(repository.path()).await?;
    let mut config = configuration(&host, &entries)?;
    let lfs_storage =
        if !endpoints.is_empty() && matches!(assignment, AccountAssignment::Assigned { .. }) {
            lfs_storage::prepare(repository).await?
        } else {
            None
        };
    if let Some(storage) = &lfs_storage {
        config.extend(storage.config());
    }
    let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
        .await
        .context("Start private Git credential broker")?;
    let helper = std::env::current_exe().context("Locate Git credential helper")?;
    let lease = Arc::new(Lease {
        repository: repository.clone(),
        basis,
        assignment,
        operation,
        checkout_head_remote,
        host,
        endpoints,
        config,
        logs_isolated: lfs_storage.is_some(),
        address: listener.local_addr()?.to_string(),
        capability: uuid::Uuid::new_v4().to_string(),
        helper,
        cancellation: Cancellation::default(),
        session: Mutex::new(session),
        verified: Mutex::new(Vec::new()),
    });
    let parent = Cancellation::current();
    let broker_parent = parent.clone();
    let broker_lease = lease.clone();
    let broker = tokio::spawn(async move {
        serve(listener, broker_lease, broker_parent).await;
    });
    let guard = BrokerGuard {
        lease: lease.clone(),
        broker: Some(broker),
        _storage: lfs_storage,
    };
    let result = lease
        .cancellation
        .clone()
        .scope(CURRENT.scope(lease.clone(), async {
            if lease.checkout_head_remote.is_some() {
                parent.check()?;
                lease.check_current().await?;
                parent.check()?;
                lease.cancellation.check()?;
            }
            work.await
        }))
        .await;
    guard.finish().await;
    result
}

fn supported_git(bytes: &[u8]) -> bool {
    let Some(version) = std::str::from_utf8(bytes)
        .ok()
        .and_then(|value| value.strip_prefix("git version "))
    else {
        return false;
    };
    let mut parts = version.split('.');
    let number = |value: Option<&str>| {
        value
            .and_then(|value| {
                value
                    .split(|character: char| !character.is_ascii_digit())
                    .next()
            })
            .and_then(|value| value.parse::<u64>().ok())
    };
    matches!((number(parts.next()), number(parts.next())), (Some(major), Some(minor)) if major > 2 || (major == 2 && minor >= 46))
}

fn needs_credentials(operation: &Operation) -> bool {
    matches!(
        operation,
        Operation::Fetch { .. }
            | Operation::Pull { .. }
            | Operation::Push { .. }
            | Operation::RemoteBranchDeletePreview { .. }
            | Operation::DeleteRemoteBranch { .. }
            | Operation::DeleteBranchPreview {
                upstream: Some(_),
                ..
            }
            | Operation::DeleteBranch { .. }
            | Operation::RestoreRemoteTip { .. }
            | Operation::LfsTransfer { .. }
            | Operation::LfsCheckout { .. }
            | Operation::Commit { .. }
            | Operation::Stage { .. }
            | Operation::StageConflict { .. }
            | Operation::ResolveConflict { .. }
            | Operation::Recover { .. }
            | Operation::Checkout { .. }
            | Operation::Detach { .. }
            | Operation::CreateBranch { .. }
            | Operation::Discard { .. }
            | Operation::UndoDiscard { .. }
            | Operation::Merge { .. }
            | Operation::MergeAbort
            | Operation::Rebase { .. }
            | Operation::RebaseAbort
            | Operation::RebaseContinue
            | Operation::CherryPick { .. }
            | Operation::Revert { .. }
            | Operation::StashSave { .. }
            | Operation::StashApply { .. }
            | Operation::StashMove { .. }
            | Operation::WorktreeAdd { .. }
            | Operation::SubmoduleAdd { .. }
            | Operation::SubmoduleUpdate { .. }
            | Operation::DiffDetail { .. }
            | Operation::CommitDiff { .. }
    ) || matches!(operation, Operation::Github { request } if matches!(request.action, crate::GitHubAction::CheckoutPullRequest { .. }))
}

struct BrokerGuard {
    lease: Arc<Lease>,
    broker: Option<tokio::task::JoinHandle<()>>,
    // The caller owns filesystem cleanup, independent of detached task drops.
    _storage: Option<lfs_storage::Storage>,
}
impl BrokerGuard {
    async fn finish(mut self) {
        self.lease.cancellation.cancel();
        if let Some(broker) = self.broker.take() {
            let _ = broker.await;
        }
    }
}
impl Drop for BrokerGuard {
    fn drop(&mut self) {
        self.lease.cancellation.cancel();
        // A dropped request leaves the broker running just long enough to drain
        // its children. Normal completion awaits it before a CLI can exit.
    }
}

async fn serve(listener: TcpListener, lease: Arc<Lease>, parent: Cancellation) {
    let monitor_lease = lease.clone();
    let monitor_parent = parent.clone();
    let monitor = AbortTask(Some(tokio::spawn(async move {
        monitor_lease.monitor(monitor_parent).await;
    })));
    let mut requests = JoinSet::new();
    loop {
        tokio::select! {
            biased;
            _ = parent.cancelled() => { lease.cancellation.cancel(); break; },
            _ = lease.cancellation.cancelled() => break,
            Some(_) = requests.join_next(), if !requests.is_empty() => {},
            accepted = listener.accept(), if requests.len() < 16 => {
                let Ok((stream, peer)) = accepted else { break; };
                if !peer.ip().is_loopback() { continue; }
                let request_lease = lease.clone();
                requests.spawn(async move {
                    let cancellation = request_lease.cancellation.clone();
                    cancellation.scope(async move {
                        let _ = tokio::time::timeout(Duration::from_secs(30), serve_request(stream, &request_lease)).await;
                    }).await;
                });
            }
        }
    }
    requests.abort_all();
    while requests.join_next().await.is_some() {}
    monitor.finish().await;
}

struct AbortTask(Option<tokio::task::JoinHandle<()>>);
impl AbortTask {
    async fn finish(mut self) {
        if let Some(task) = self.0.take() {
            task.abort();
            let _ = task.await;
        }
    }
}
impl Drop for AbortTask {
    fn drop(&mut self) {
        if let Some(task) = &self.0 {
            task.abort();
        }
    }
}

async fn serve_request(mut stream: TcpStream, lease: &Lease) -> Result<()> {
    let bytes = read_frame(&mut stream).await?;
    let request: Request =
        serde_json::from_slice(&bytes).context("Invalid private credential request")?;
    ensure!(
        constant_time_equal(request.capability.as_bytes(), lease.capability.as_bytes()),
        "Invalid private credential capability"
    );
    let reply = match lease.respond(request).await {
        Ok(reply) => reply,
        Err(_) => Reply::refused(REFUSED),
    };
    write_frame(&mut stream, &serde_json::to_vec(&reply)?).await
}

impl Lease {
    async fn monitor(&self, parent: Cancellation) {
        loop {
            tokio::select! {
                biased;
                _ = parent.cancelled() => { self.cancellation.cancel(); break; },
                _ = self.cancellation.cancelled() => break,
                _ = tokio::time::sleep(Duration::from_millis(500)) => {},
            }
            if !self
                .session
                .try_lock()
                .is_ok_and(|session| session.is_some())
            {
                continue;
            }
            let checked = tokio::select! {
                biased;
                _ = parent.cancelled() => { self.cancellation.cancel(); break; },
                _ = self.cancellation.cancelled() => break,
                result = self.check_current() => result,
            };
            if checked.is_err() {
                self.cancellation.cancel();
                break;
            }
        }
    }

    async fn check_current(&self) -> Result<()> {
        self.repository.ensure_account_basis(&self.basis).await?;
        ensure!(
            intent::collect(
                &self.repository,
                &self.operation,
                &self.host,
                self.checkout_head_remote.as_deref(),
            )
            .await?
                == self.endpoints,
            CHANGED
        );
        Ok(())
    }
    async fn respond(&self, request: Request) -> Result<Reply> {
        let operation = protocol::Operation::parse(&request.operation)?;
        let input = STANDARD.decode(request.input)?;
        let context = protocol::CredentialContext::parse(&input)?;
        if operation != protocol::Operation::Get {
            // Credential approval/rejection never modifies gh's account store.
            return Ok(Reply::output(&[]));
        }
        self.cancellation.check()?;
        if self.check_current().await.is_err() {
            return Ok(Reply::refused(CHANGED));
        }
        let directory = PathBuf::from(crate::os_from_bytes(&STANDARD.decode(request.directory)?)?);
        let root = Repository::open(&directory).await?;
        ensure!(
            root.path() == self.repository.path(),
            "Nested repository requires its own account selection"
        );
        ensure!(
            context
                .username()
                .is_none_or(|username| username.len() <= 256),
            "Invalid Git credential username"
        );
        let endpoint = Endpoint::from_credential(&context)?;
        ensure!(
            self.endpoints
                .iter()
                .any(|allowed| allowed.same_repository(&endpoint)),
            "Unintended Git credential destination"
        );
        let AccountAssignment::Assigned { host, login, id } = &self.assignment else {
            return Ok(Reply::refused(
                "No GitHub account is assigned to this repository; choose an account before retrying",
            ));
        };
        ensure!(
            endpoint.origin.authority().eq_ignore_ascii_case(host),
            "Assigned account origin mismatch"
        );
        let mut saved = self.session.lock().await;
        if saved.is_none() {
            let session = Session::open_for_account(
                self.repository.path(),
                &endpoint.identity(),
                Some(ChosenAccount {
                    host,
                    login,
                    id: Some(*id),
                }),
            )
            .await?
            .map_err(|_| anyhow::anyhow!(REFUSED))?;
            *saved = Some(Arc::new(session));
        }
        let session = saved.as_ref().context(REFUSED)?.clone();
        drop(saved);
        auth_sources::check(self.repository.path(), &self.endpoints).await?;
        let mut verified = self.verified.lock().await;
        if !verified.iter().any(|item| item.same_repository(&endpoint)) {
            ensure!(
                session.repository_access(&endpoint.identity()).await?,
                "Assigned account cannot access the requested repository"
            );
            verified.push(endpoint);
        }
        drop(verified);
        self.check_current().await?;
        self.cancellation.check()?;
        Ok(Reply::output(&session.git_credential_response(login)?))
    }
}

/// Applied centrally so checkout/commit hooks, LFS and gh checkout descendants
/// inherit policy. Values added to Git config contain no token or capability.
pub(crate) fn apply(command: &mut Command) {
    if NATIVE_CONFIGURATION
        .try_with(|value| *value)
        .unwrap_or(false)
    {
        return;
    }
    let _ = CURRENT.try_with(|lease| {
        command
            .env(ADDRESS, &lease.address)
            .env(CAPABILITY, &lease.capability)
            .env(HELPER_EXE, &lease.helper);
        // Git consumes COUNT before PARAMETERS. Appending trusted, quoted
        // entries to the latter preserves inherited configuration while making
        // this operation's helper policy the final environment config layer.
        if let Some(parameters) = inherited_parameters() {
            command.env("GIT_CONFIG_PARAMETERS", parameters);
        }
        for key in [
            "GIT_TRACE",
            "GIT_TRACE_PACKET",
            "GIT_TRACE_CURL",
            "GIT_CURL_VERBOSE",
            "GIT_TRACE2",
            "GIT_TRACE2_EVENT",
            "GIT_TRACE2_PERF",
            "GIT_TRANSFER_TRACE",
            "GIT_LOG_STATS",
            "LFS_DEBUG_HTTP",
            "GIT_LFS_PROGRESS",
        ] {
            command.env_remove(key);
        }
    });
}

pub(crate) fn logs_isolated() -> bool {
    CURRENT
        .try_with(|lease| lease.logs_isolated)
        .unwrap_or(false)
}

/// Review certificates describe native repository configuration. Ephemeral
/// credential routing and LFS log guards must not invalidate a reviewed basis.
pub(crate) async fn native_configuration<T>(work: impl Future<Output = T>) -> T {
    NATIVE_CONFIGURATION.scope(true, work).await
}

/// Reuse the already verified API session when a typed operation also runs Git.
pub(crate) async fn seed_session(session: Arc<Session>) -> Result<()> {
    if let Ok(lease) = CURRENT.try_with(Clone::clone) {
        let mut saved = lease.session.lock().await;
        ensure!(saved.is_none(), "Git credential session already selected");
        *saved = Some(session);
    }
    Ok(())
}

pub(crate) async fn redact(mut output: RawOutput) -> RawOutput {
    if NATIVE_CONFIGURATION
        .try_with(|value| *value)
        .unwrap_or(false)
    {
        return output;
    }
    if let Ok(lease) = CURRENT.try_with(Clone::clone) {
        if let Some(session) = lease.session.lock().await.as_ref() {
            output = session.redact_output(output);
        }
        output.stdout = redact_literal(output.stdout, lease.capability.as_bytes());
        output.stderr = redact_literal(output.stderr, lease.capability.as_bytes());
    }
    output
}
fn redact_literal(bytes: Vec<u8>, secret: &[u8]) -> Vec<u8> {
    if secret.is_empty() {
        return bytes;
    }
    let mut result = Vec::with_capacity(bytes.len());
    let mut rest = bytes.as_slice();
    while let Some(at) = rest
        .windows(secret.len())
        .position(|candidate| candidate == secret)
    {
        result.extend_from_slice(&rest[..at]);
        result.extend_from_slice(b"[redacted]");
        rest = &rest[at + secret.len()..];
    }
    result.extend_from_slice(rest);
    result
}

/// Restore caller configuration plus this operation's tokenless policy after a
/// native branch guard removes its own hook overrides.
pub(crate) fn inherited_parameters() -> Option<std::ffi::OsString> {
    let original = std::env::var_os("GIT_CONFIG_PARAMETERS");
    if NATIVE_CONFIGURATION
        .try_with(|value| *value)
        .unwrap_or(false)
    {
        return original;
    }
    match CURRENT
        .try_with(|lease| append_configuration(original.clone().unwrap_or_default(), &lease.config))
    {
        Ok(parameters) => Some(parameters),
        Err(_) => original,
    }
}

fn append_configuration(
    mut parameters: std::ffi::OsString,
    config: &[(String, String)],
) -> std::ffi::OsString {
    for (key, value) in config {
        if !parameters.is_empty() {
            parameters.push(" ");
        }
        parameters.push(quote_config_parameter(&format!("{key}={value}")));
    }
    parameters
}

fn quote_config_parameter(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

fn configuration(host: &str, entries: &[(String, String)]) -> Result<Vec<(String, String)>> {
    let count = std::env::var("GIT_CONFIG_COUNT")
        .unwrap_or_else(|_| "0".into())
        .parse::<usize>()
        .context("Invalid inherited Git configuration count")?;
    ensure!(
        count <= 4096,
        "Inherited Git configuration exceeds the supported limit"
    );
    let mut scopes =
        std::collections::BTreeSet::from([format!("https://{host}"), format!("http://{host}")]);
    for (key, _) in entries {
        if let Some(section) = key
            .strip_prefix("credential.")
            .and_then(|key| key.rsplit_once('.'))
            .map(|(section, _)| section)
            && protected_section(section, host)
        {
            scopes.insert(section.to_owned());
        }
    }
    let mut config = Vec::new();
    for section in scopes {
        config.push((format!("credential.{section}.helper"), String::new()));
        config.push((format!("credential.{section}.helper"), HELPER.to_owned()));
        config.push((format!("credential.{section}.useHttpPath"), "true".into()));
    }
    let mut http_scopes = std::collections::BTreeSet::from([format!("https://{host}")]);
    for (key, _) in entries {
        if let Some(section) = key
            .strip_prefix("http.")
            .and_then(|key| key.rsplit_once('.'))
            .map(|(section, _)| section)
            && protected_section(section, host)
        {
            http_scopes.insert(section.to_owned());
        }
    }
    for section in http_scopes {
        config.push((format!("http.{section}.proactiveAuth"), "basic".into()));
        config.push((format!("http.{section}.emptyAuth"), "false".into()));
        config.push((format!("http.{section}.followRedirects"), "false".into()));
    }
    config.push(("lfs.cachecredentials".into(), "false".into()));
    Ok(config)
}
fn protected_section(section: &str, host: &str) -> bool {
    let Some((scheme, remainder)) = section.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https") && !scheme.eq_ignore_ascii_case("http") {
        return false;
    }
    let authority = remainder.split('/').next().unwrap_or("");
    let authority = authority.rsplit('@').next().unwrap_or(authority);
    authority.eq_ignore_ascii_case(host)
        || authority
            .strip_suffix(":443")
            .is_some_and(|value| value.eq_ignore_ascii_case(host))
}
fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    let mut difference = left.len() ^ right.len();
    for (left, right) in left.iter().zip(right) {
        difference |= usize::from(left ^ right);
    }
    difference == 0
}
async fn read_frame(stream: &mut TcpStream) -> Result<Vec<u8>> {
    let length = stream.read_u32().await? as usize;
    ensure!(
        length <= MAX_FRAME,
        "Private credential frame exceeds limit"
    );
    let mut bytes = vec![0; length];
    stream.read_exact(&mut bytes).await?;
    Ok(bytes)
}
async fn write_frame(stream: &mut TcpStream, bytes: &[u8]) -> Result<()> {
    ensure!(
        bytes.len() <= MAX_FRAME,
        "Private credential frame exceeds limit"
    );
    stream.write_u32(bytes.len() as u32).await?;
    stream.write_all(bytes).await?;
    stream.shutdown().await?;
    Ok(())
}

/// Private CLI entry point. Failure always stops Git's helper chain; no fallback
/// credential store is consulted, and store/erase remain read-only no-ops.
pub async fn helper(operation: &str) -> Result<()> {
    let result = helper_inner(operation).await;
    let mut stdout = tokio::io::stdout();
    match result {
        Ok(reply) => {
            if let Some(error) = reply.error {
                eprintln!("{error}");
            }
            stdout.write_all(&STANDARD.decode(reply.output)?).await?;
        }
        Err(_) => {
            eprintln!("{REFUSED}");
            stdout.write_all(protocol::refusal()).await?;
        }
    }
    stdout.flush().await?;
    Ok(())
}
async fn helper_inner(operation: &str) -> Result<Reply> {
    let operation_kind = protocol::Operation::parse(operation)?;
    let mut input = Vec::new();
    tokio::io::stdin()
        .take((protocol::MAX_INPUT_BYTES + 1) as u64)
        .read_to_end(&mut input)
        .await?;
    protocol::CredentialContext::parse(&input)?;
    if operation_kind != protocol::Operation::Get {
        return Ok(Reply::output(&[]));
    }
    let address: std::net::SocketAddr = std::env::var(ADDRESS)?.parse()?;
    ensure!(
        address.ip() == std::net::IpAddr::V4(std::net::Ipv4Addr::LOCALHOST),
        "Invalid private credential address"
    );
    let request = Request {
        capability: std::env::var(CAPABILITY)?,
        operation: operation.to_owned(),
        directory: STANDARD.encode(std::env::current_dir()?.as_os_str().as_encoded_bytes()),
        input: STANDARD.encode(input),
    };
    tokio::time::timeout(Duration::from_secs(35), async {
        let mut stream = TcpStream::connect(address).await?;
        write_frame(&mut stream, &serde_json::to_vec(&request)?).await?;
        Ok(serde_json::from_slice(&read_frame(&mut stream).await?)?)
    })
    .await
    .context("Private credential lookup timed out")?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn override_matches_existing_specific_scopes_without_replacing_native_hosts() {
        let entries = vec![
            (
                "credential.https://github.com/owner/repo.helper".into(),
                "native".into(),
            ),
            (
                "credential.https://github.com/owner/repo.usehttppath".into(),
                "false".into(),
            ),
            (
                "credential.https://other.example/repo.helper".into(),
                "native".into(),
            ),
            (
                "http.https://github.com/owner/repo.emptyauth".into(),
                "true".into(),
            ),
        ];
        let config = configuration("github.com", &entries).unwrap();
        let helpers: Vec<_> = config
            .iter()
            .filter(|(key, _)| key == "credential.https://github.com/owner/repo.helper")
            .map(|(_, value)| value.as_str())
            .collect();
        assert_eq!(helpers, vec!["", HELPER]);
        assert!(config.iter().any(|(key, value)| key
            == "http.https://github.com/owner/repo.proactiveAuth"
            && value == "basic"));
        assert!(config.iter().all(|(key, _)| !key.contains("other.example")));
        assert!(!config.iter().any(|(key, _)| key == "credential.helper"));
        for (key, value) in config {
            assert!(!key.contains("CAPABILITY") && !value.contains("password="));
        }
    }

    #[test]
    fn assigned_transport_requires_native_proactive_basic_support() {
        for version in [
            b"git version 2.46.0".as_slice(),
            b"git version 2.56.0.windows.1",
            b"git version 3.0.0",
        ] {
            assert!(supported_git(version));
        }
        for version in [
            b"git version 2.45.9".as_slice(),
            b"git version 1.99.0",
            b"git version synthetic-secret",
            b"other 2.99",
        ] {
            assert!(!supported_git(version));
        }
    }

    #[test]
    fn command_configuration_quotes_are_literal_git_parameters() {
        assert_eq!(
            quote_config_parameter("credential.helper=!f() { \"$EXE\" \"$@\"; }; f"),
            "'credential.helper=!f() { \"$EXE\" \"$@\"; }; f'"
        );
        assert_eq!(quote_config_parameter("key=one'two"), "'key=one'\\''two'");
    }

    #[test]
    fn installed_git_accepts_new_and_inherited_quoted_configuration() {
        let literal = "one'two \"$HOME\"";
        for inherited in ["", "'desktop.inherited=kept'", "'desktop.inherited'='kept'"] {
            let parameters = append_configuration(
                inherited.into(),
                &[("desktop.literal".into(), literal.into())],
            );
            let result = std::process::Command::new("git")
                .args(["config", "--get", "desktop.literal"])
                .env("GIT_CONFIG_COUNT", "0")
                .env("GIT_CONFIG_PARAMETERS", &parameters)
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env(
                    "GIT_CONFIG_GLOBAL",
                    std::env::temp_dir()
                        .join(format!("desktop-config-absent-{}", uuid::Uuid::new_v4())),
                )
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "Installed Git rejected composed configuration"
            );
            assert_eq!(result.stdout, format!("{literal}\n").as_bytes());
        }
    }

    #[test]
    fn private_capability_and_diagnostic_redaction_preserve_binary_bytes() {
        assert!(constant_time_equal(b"fixed", b"fixed"));
        assert!(!constant_time_equal(b"fixed", b"fix"));
        assert!(!constant_time_equal(b"fixed", b"fired"));
        assert_eq!(
            redact_literal(b"\xffprivate\0private".to_vec(), b"private"),
            b"\xff[redacted]\0[redacted]"
        );
    }

    #[tokio::test]
    async fn private_channel_bounds_frames_before_allocation() {
        let listener = TcpListener::bind((std::net::Ipv4Addr::LOCALHOST, 0))
            .await
            .unwrap();
        let address = listener.local_addr().unwrap();
        let sender = tokio::spawn(async move {
            let mut stream = TcpStream::connect(address).await.unwrap();
            stream.write_u32((MAX_FRAME + 1) as u32).await.unwrap();
        });
        let (mut stream, _) = listener.accept().await.unwrap();
        assert!(read_frame(&mut stream).await.is_err());
        sender.await.unwrap();
    }
}
