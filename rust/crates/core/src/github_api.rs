//! Fixed, bounded API requests bound to one explicit repository and gh credential.
//!
//! The session and its credential deliberately implement neither Debug nor
//! serialization. Raw gh output is inspected here and never attached to errors.
use crate::{RepositoryIdentity, cancellation::Cancellation, process};
use anyhow::Result;
use serde::Serialize;
use serde_json::Value;
use std::{
    ffi::OsString,
    fmt,
    path::{Path, PathBuf},
};

pub(crate) const MAX_PAGES: u16 = 16;
const PAGE_SIZE: usize = 100;
const MAX_JSON_BYTES: usize = 1024 * 1024;
const MAX_TOKEN_BYTES: usize = 64 * 1024;
const MAX_BRANCH_BYTES: usize = 8192;
const MAX_ACCOUNTS: usize = 128;

#[derive(Clone, Copy)]
pub(crate) enum Request<'a> {
    User,
    Repository,
    UserOrganizations { page: u16 },
    Pull { number: u64 },
    BranchRules { branch: &'a str, page: u16 },
    Ruleset { id: u64 },
}

/// Catalog login spelling is retained because gh's named-user lookup is case-sensitive.
#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct CatalogAccount {
    pub host: String,
    pub login: String,
    pub active: bool,
    pub state: String,
    pub token_source: Option<String>,
    pub git_protocol: Option<String>,
}

#[derive(Clone, Copy)]
pub(crate) struct ChosenAccount<'a> {
    pub host: &'a str,
    pub login: &'a str,
    pub id: Option<u64>,
}
struct ExpectedAccount {
    login: String,
    id: Option<u64>,
}
#[derive(Clone, Copy)]
enum Credentials<'a> {
    Effective,
    Stored,
    Pinned(&'a str),
}

#[derive(Debug, Eq, PartialEq)]
pub(crate) enum Failure {
    NoAccount { code: i32 },
    GhExit { code: i32 },
    Transport,
    InvalidCredential,
    AccountMismatch,
    InvalidResponse,
    ResponseLimit,
}
impl Failure {
    pub(crate) fn exit_code(&self) -> Option<i32> {
        match self {
            Self::NoAccount { code } | Self::GhExit { code } => Some(*code),
            _ => None,
        }
    }
    pub(crate) fn is_no_account(&self) -> bool {
        matches!(self, Self::NoAccount { .. })
    }
}
impl fmt::Display for Failure {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(match self {
            Self::NoAccount { .. } => "No authenticated GitHub account is available",
            Self::GhExit { .. } => "GitHub API command failed",
            Self::Transport => "GitHub API command is unavailable",
            Self::InvalidCredential => "GitHub authentication could not be read safely",
            Self::AccountMismatch => "GitHub authentication does not match the assigned account",
            Self::InvalidResponse => "GitHub API returned an invalid response",
            Self::ResponseLimit => "GitHub API response exceeds the supported limit",
        })
    }
}

pub(crate) struct PullRequestInput<'a> {
    pub repository_id: &'a str,
    pub title: &'a str,
    pub body: &'a str,
    pub base: &'a str,
    pub head: &'a str,
    pub draft: bool,
}

const PULL_REQUEST_CREATE_CONTEXT: &str = r#"
query DesktopPullRequestCreateContext($owner: String!, $name: String!, $head: String!, $after: String) {
  repository(owner: $owner, name: $name) {
    id nameWithOwner url
    pullRequests(headRefName: $head, states: [OPEN], first: 100, after: $after,
                 orderBy: {field: CREATED_AT, direction: DESC}) {
      nodes { url state baseRefName headRefName isCrossRepository headRepositoryOwner { login } }
      pageInfo { hasNextPage endCursor }
    }
  }
}"#;
const PULL_REQUEST_CREATE: &str = r#"
mutation PullRequestCreate($input: CreatePullRequestInput!) {
  createPullRequest(input: $input) { pullRequest { id url } }
}"#;

pub(crate) struct Session {
    path: PathBuf,
    repository: RepositoryIdentity,
    token: String,
    account: Option<ExpectedAccount>,
}
impl Session {
    /// Capture the effective environment/store token without refreshing it.
    /// Cancellation remains an outer error; all other command failures are
    /// sanitized inner results, including the original nonzero exit status.
    pub(crate) async fn open(
        path: &Path,
        repository: &RepositoryIdentity,
    ) -> Result<std::result::Result<Self, Failure>> {
        Self::open_for_account(path, repository, None).await
    }

    /// An assigned account selects only its stored credential. Its effective
    /// REST identity is proved before any repository/rule request is available.
    pub(crate) async fn open_for_account(
        path: &Path,
        repository: &RepositoryIdentity,
        account: Option<ChosenAccount<'_>>,
    ) -> Result<std::result::Result<Self, Failure>> {
        repository.validate()?;
        if let Some(account) = account {
            anyhow::ensure!(
                account.host == repository.host,
                "Assigned GitHub account belongs to a different host"
            );
            anyhow::ensure!(
                valid_login(account.login) && account.id.is_none_or(|id| id > 0),
                "Invalid assigned GitHub account"
            );
        }
        let login = account.map(|account| account.login);
        let arguments = token_arguments(&repository.host, login);
        let credentials = if account.is_some() {
            Credentials::Stored
        } else {
            Credentials::Effective
        };
        let output = match private_command(path, &arguments, credentials).await? {
            Ok(output) => output,
            Err(failure) => return Ok(Err(failure)),
        };
        if output.code != 0 {
            // `auth token` uses exit 1 for absent accounts. Only bounded,
            // sanitized account data may distinguish absence from keychain errors.
            let no_account = if output.code == 4 {
                true
            } else if output.code == 1 {
                if let Some(account) = account {
                    match account_catalog(path, &repository.host).await? {
                        Ok(accounts) => !accounts
                            .iter()
                            .any(|entry| entry.login.eq_ignore_ascii_case(account.login)),
                        Err(_) => false,
                    }
                } else {
                    let arguments = auth_arguments(&repository.host, true);
                    match private_command(path, &arguments, Credentials::Effective).await? {
                        Ok(status) if status.code == 0 => confirms_no_account(&status.stdout),
                        _ => false,
                    }
                }
            } else {
                false
            };
            return Ok(Err(if no_account {
                Failure::NoAccount { code: output.code }
            } else {
                Failure::GhExit { code: output.code }
            }));
        }
        let token = match credential(output.stdout) {
            Ok(token) => token,
            Err(failure) => return Ok(Err(failure)),
        };
        let session = Self {
            path: path.to_owned(),
            repository: repository.clone(),
            token,
            account: account.map(|account| ExpectedAccount {
                login: account.login.to_owned(),
                id: account.id,
            }),
        };
        if session.account.is_some()
            && let Err(failure) = session.get(Request::User).await?
        {
            return Ok(Err(failure));
        }
        Ok(Ok(session))
    }

    /// Check access to one operation-derived destination with the captured token.
    pub(crate) async fn repository_access(&self, repository: &RepositoryIdentity) -> Result<bool> {
        repository.validate()?;
        anyhow::ensure!(
            repository.host == self.repository.host,
            "Git credential origin mismatch"
        );
        let arguments = request_arguments(repository, Request::Repository)?;
        let output = match private_command(&self.path, &arguments, Credentials::Pinned(&self.token))
            .await?
        {
            Ok(output) if output.code == 0 => output,
            _ => return Ok(false),
        };
        let value = match response(Request::Repository, &output.stdout) {
            Ok(value) => value,
            Err(_) => return Ok(false),
        };
        Ok(value["id"].as_u64().is_some_and(|id| id > 0)
            && value["full_name"].as_str().is_some_and(|name| {
                name.eq_ignore_ascii_case(&format!("{}/{}", repository.owner, repository.name))
            }))
    }

    /// Read one verified-host repository using this session's captured credential.
    pub(crate) async fn repository_by_identity(
        &self,
        identity: &RepositoryIdentity,
    ) -> Result<std::result::Result<Value, Failure>> {
        identity.validate()?;
        anyhow::ensure!(
            identity.host == self.repository.host,
            "GitHub repository host changed"
        );
        let arguments = request_arguments(identity, Request::Repository)?;
        let output = match private_command(&self.path, &arguments, Credentials::Pinned(&self.token))
            .await?
        {
            Ok(output) => output,
            Err(failure) => return Ok(Err(failure)),
        };
        if output.code != 0 {
            return Ok(Err(Failure::GhExit { code: output.code }));
        }
        Ok(response(Request::Repository, &output.stdout))
    }

    /// Encode a broker-authorized Git response without exposing the captured token.
    pub(crate) fn git_credential_response(&self, username: &str) -> Result<Vec<u8>> {
        anyhow::ensure!(valid_login(username), "Invalid Git credential username");
        anyhow::ensure!(
            self.account
                .as_ref()
                .is_none_or(|account| account.login.eq_ignore_ascii_case(username)),
            "Git credential username does not match the assigned account"
        );
        crate::git_credentials::protocol::encode_authorized(username, &self.token)
    }

    /// Remove this session's credential from both output streams before publication.
    pub(crate) fn redact_output(&self, mut output: process::RawOutput) -> process::RawOutput {
        use base64::Engine as _;
        let mut secrets = vec![
            self.token.as_bytes().to_vec(),
            base64::engine::general_purpose::STANDARD
                .encode(&self.token)
                .into_bytes(),
            component(&self.token).into_bytes(),
        ];
        if let Some(account) = &self.account {
            secrets.push(
                base64::engine::general_purpose::STANDARD
                    .encode(format!("{}:{}", account.login, self.token))
                    .into_bytes(),
            );
        }
        for secret in secrets {
            output.stdout = redact_credential(output.stdout, &secret);
            output.stderr = redact_credential(output.stderr, &secret);
        }
        output
    }

    /// Also redact alternate Base64 encodings for a verified actor, including
    /// sessions that did not originate from a named saved account.
    pub(crate) fn redact_output_for_login(
        &self,
        output: process::RawOutput,
        login: &str,
    ) -> process::RawOutput {
        use base64::Engine as _;
        let mut output = self.redact_output(output);
        let basic = format!("{login}:{}", self.token);
        for engine in [
            base64::engine::general_purpose::STANDARD,
            base64::engine::general_purpose::STANDARD_NO_PAD,
            base64::engine::general_purpose::URL_SAFE,
            base64::engine::general_purpose::URL_SAFE_NO_PAD,
        ] {
            for encoded in [engine.encode(&self.token), engine.encode(&basic)] {
                output.stdout = redact_credential(output.stdout, encoded.as_bytes());
                output.stderr = redact_credential(output.stderr, encoded.as_bytes());
            }
        }
        output
    }

    /// Execute only commands assembled by the typed GitHub adapter. Input is
    /// passed through stdin unchanged; credential bytes never reach diagnostics.
    pub(crate) async fn run(
        &self,
        arguments: &[OsString],
        input: Option<Vec<u8>>,
    ) -> Result<process::RawOutput> {
        let cancellation = Cancellation::current();
        cancellation.check()?;
        let output =
            process::run_gh_private_input(&self.path, arguments, input, Some(&self.token)).await;
        cancellation.check()?;
        let output = output.map_err(|_| anyhow::anyhow!("GitHub CLI command is unavailable"))?;
        Ok(self.redact_output(output))
    }

    /// Send the one fixed repository-creation request with this captured token.
    /// The caller persists an uncertain receipt before invoking this method.
    pub(crate) async fn create_repository(
        &self,
        owner: &str,
        name: &str,
        description: &str,
        private: bool,
        organization: bool,
    ) -> Result<std::result::Result<Value, Failure>> {
        crate::github::validate_repository(&format!("{owner}/{name}"))?;
        let endpoint = if organization {
            format!("/orgs/{owner}/repos")
        } else {
            "/user/repos".into()
        };
        let arguments = crate::args(&[
            "api",
            "--method",
            "POST",
            "--hostname",
            &self.repository.host,
            "--header",
            "Accept: application/vnd.github+json",
            &endpoint,
            "--input",
            "-",
        ]);
        let input = serde_json::to_vec(
            &serde_json::json!({"name":name,"description":description,"private":private}),
        )?;
        let cancellation = Cancellation::current();
        cancellation.check()?;
        let output =
            process::run_gh_private_input(&self.path, &arguments, Some(input), Some(&self.token))
                .await;
        cancellation.check()?;
        let output = match output {
            Ok(output) => output,
            Err(_) => return Ok(Err(Failure::Transport)),
        };
        if output.code != 0 {
            return Ok(Err(Failure::GhExit { code: output.code }));
        }
        if output.stdout.len() > MAX_JSON_BYTES {
            return Ok(Err(Failure::ResponseLimit));
        }
        let value = match serde_json::from_slice(&output.stdout) {
            Ok(value) => value,
            Err(_) => return Ok(Err(Failure::InvalidResponse)),
        };
        Ok(Ok(value))
    }

    /// Read the host's native gh protocol preference without an API credential.
    /// This fixed config command does not resolve a repository or run Git.
    pub(crate) async fn git_protocol(&self) -> Result<String> {
        let arguments = crate::args(&[
            "config",
            "get",
            "git_protocol",
            "--host",
            &self.repository.host,
        ]);
        let output = private_command(&self.path, &arguments, Credentials::Stored)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot read the GitHub Git protocol preference"))?;
        let protocol = std::str::from_utf8(&output.stdout)
            .ok()
            .map(str::trim)
            .filter(|value| matches!(*value, "https" | "ssh"));
        anyhow::ensure!(
            output.code == 0 && protocol.is_some(),
            "Cannot read the GitHub Git protocol preference"
        );
        Ok(protocol.unwrap().to_owned())
    }

    /// Resolve the selected repository and all matching open-PR candidates.
    /// Variables travel as JSON stdin, never through gh's placeholder expansion.
    pub(crate) async fn pull_request_create_context(
        &self,
        head: &str,
        after: Option<&str>,
    ) -> Result<std::result::Result<Value, Failure>> {
        self.graphql(
            PULL_REQUEST_CREATE_CONTEXT,
            serde_json::json!({
                "owner": self.repository.owner,
                "name": self.repository.name,
                "head": head,
                "after": after,
            }),
        )
        .await
    }

    /// The only mutation available through this fixed API boundary.
    pub(crate) async fn create_pull_request(
        &self,
        input: PullRequestInput<'_>,
    ) -> Result<std::result::Result<Value, Failure>> {
        self.graphql(
            PULL_REQUEST_CREATE,
            serde_json::json!({"input": {
                "repositoryId": input.repository_id,
                "title": input.title,
                "body": input.body,
                "baseRefName": input.base,
                "headRefName": input.head,
                "draft": input.draft,
                "maintainerCanModify": true,
            }}),
        )
        .await
    }

    async fn graphql(
        &self,
        query: &'static str,
        variables: Value,
    ) -> Result<std::result::Result<Value, Failure>> {
        let cancellation = Cancellation::current();
        cancellation.check()?;
        let arguments = crate::args(&[
            "api",
            "--method",
            "POST",
            "--hostname",
            &self.repository.host,
            "--header",
            "Accept: application/vnd.github+json",
            "graphql",
            "--input",
            "-",
        ]);
        let input = serde_json::to_vec(&serde_json::json!({"query":query,"variables":variables}))?;
        let output =
            process::run_gh_private_input(&self.path, &arguments, Some(input), Some(&self.token))
                .await;
        cancellation.check()?;
        let output = match output {
            Ok(output) => output,
            Err(_) => return Ok(Err(Failure::Transport)),
        };
        if output.code != 0 {
            return Ok(Err(Failure::GhExit { code: output.code }));
        }
        // Parse private bytes before redaction. Only validated identifiers/URLs
        // leave the workflow; raw JSON/errors/diagnostics never reach callers.
        Ok(graphql_response(&output.stdout))
    }

    /// Every read uses this session's captured token, even if gh's active
    /// account changes between requests. Callers paginate only fixed pages;
    /// a full final page is an incomplete result and must not certify a pass.
    pub(crate) async fn get(
        &self,
        request: Request<'_>,
    ) -> Result<std::result::Result<Value, Failure>> {
        let arguments = request_arguments(&self.repository, request)?;
        let output = match private_command(&self.path, &arguments, Credentials::Pinned(&self.token))
            .await?
        {
            Ok(output) => output,
            Err(failure) => return Ok(Err(failure)),
        };
        if output.code != 0 {
            return Ok(Err(Failure::GhExit { code: output.code }));
        }
        let value = match response(request, &output.stdout) {
            Ok(value) => value,
            Err(failure) => return Ok(Err(failure)),
        };
        if let (Request::User, Some(account)) = (request, &self.account)
            && !matches_account(&value, account)
        {
            return Ok(Err(Failure::AccountMismatch));
        }
        Ok(Ok(value))
    }
}

async fn private_command(
    path: &Path,
    arguments: &[OsString],
    credentials: Credentials<'_>,
) -> Result<std::result::Result<process::RawOutput, Failure>> {
    let cancellation = Cancellation::current();
    cancellation.check()?;
    let output = match credentials {
        Credentials::Effective => process::run_gh_private(path, arguments, None).await,
        Credentials::Stored => process::run_gh_stored(path, arguments).await,
        Credentials::Pinned(token) => process::run_gh_private(path, arguments, Some(token)).await,
    };
    cancellation.check()?;
    // A process error can contain system paths or future gh diagnostics.
    // Only cancellation is propagated; no command error is interpolated.
    Ok(output.map_err(|_| Failure::Transport))
}

/// Catalog entries are stored-account hints, never proof of an API actor.
pub(crate) async fn account_catalog(
    path: &Path,
    host: &str,
) -> Result<std::result::Result<Vec<CatalogAccount>, Failure>> {
    RepositoryIdentity {
        host: host.into(),
        owner: "account-catalog".into(),
        name: "account-catalog".into(),
    }
    .validate()?;
    let arguments = auth_arguments(host, true);
    let output = match private_command(path, &arguments, Credentials::Stored).await? {
        Ok(output) => output,
        Err(failure) => return Ok(Err(failure)),
    };
    if output.code != 0 {
        return Ok(Err(Failure::GhExit { code: output.code }));
    }
    Ok(catalog_response(host, &output.stdout))
}

fn token_arguments(host: &str, login: Option<&str>) -> Vec<OsString> {
    let mut arguments = crate::args(&["auth", "token", "--hostname", host]);
    if let Some(login) = login {
        arguments.extend(crate::args(&["--user", login]));
    }
    arguments.push("--no-refresh".into());
    arguments
}

fn valid_login(login: &str) -> bool {
    !login.is_empty()
        && login.len() <= 256
        && !login.starts_with('-')
        && !matches!(login, "." | "..")
        && login
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"-_.[]".contains(&byte))
}

fn matches_account(value: &Value, account: &ExpectedAccount) -> bool {
    value["login"]
        .as_str()
        .is_some_and(|login| valid_login(login) && login.eq_ignore_ascii_case(&account.login))
        && value["id"]
            .as_u64()
            .is_some_and(|id| id > 0 && account.id.is_none_or(|expected| id == expected))
}

fn catalog_response(host: &str, bytes: &[u8]) -> std::result::Result<Vec<CatalogAccount>, Failure> {
    if bytes.len() > MAX_JSON_BYTES {
        return Err(Failure::ResponseLimit);
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    let hosts = value
        .get("hosts")
        .and_then(Value::as_object)
        .ok_or(Failure::InvalidResponse)?;
    if hosts.is_empty() {
        return Ok(Vec::new());
    }
    // A fixed-host command must not silently treat another host's response as
    // proof that the assigned account is missing.
    if hosts.len() != 1 {
        return Err(Failure::InvalidResponse);
    }
    let rows = hosts
        .get(host)
        .and_then(Value::as_array)
        .ok_or(Failure::InvalidResponse)?;
    if rows.len() > MAX_ACCOUNTS {
        return Err(Failure::ResponseLimit);
    }
    let mut accounts: Vec<CatalogAccount> = Vec::with_capacity(rows.len());
    for row in rows {
        let login = row["login"]
            .as_str()
            .filter(|login| valid_login(login))
            .ok_or(Failure::InvalidResponse)?;
        if row
            .get("host")
            .is_some_and(|value| value.as_str() != Some(host))
            || accounts
                .iter()
                .any(|entry| entry.login.eq_ignore_ascii_case(login))
        {
            return Err(Failure::InvalidResponse);
        }
        let active = match row.get("active") {
            Some(value) => value.as_bool().ok_or(Failure::InvalidResponse)?,
            None => false,
        };
        let state = match row["state"].as_str() {
            Some("success") => "success",
            Some("error") => "error",
            _ => "unknown",
        };
        let token_source = row["tokenSource"]
            .as_str()
            .filter(|value| {
                matches!(
                    *value,
                    "GH_TOKEN"
                        | "GITHUB_TOKEN"
                        | "GH_ENTERPRISE_TOKEN"
                        | "GITHUB_ENTERPRISE_TOKEN"
                        | "keyring"
                        | "keychain"
                        | "oauth_token"
                        | "stored"
                        | "environment"
                )
            })
            .map(str::to_owned);
        let git_protocol = row["gitProtocol"]
            .as_str()
            .filter(|value| matches!(*value, "ssh" | "https"))
            .map(str::to_owned);
        accounts.push(CatalogAccount {
            host: host.into(),
            login: login.into(),
            active,
            state: state.into(),
            token_source,
            git_protocol,
        });
    }
    Ok(accounts)
}

fn auth_arguments(host: &str, status: bool) -> Vec<OsString> {
    if status {
        crate::args(&[
            "auth",
            "status",
            "--hostname",
            host,
            "--json",
            "hosts",
            "--no-refresh",
        ])
    } else {
        token_arguments(host, None)
    }
}

fn request_arguments(
    repository: &RepositoryIdentity,
    request: Request<'_>,
) -> Result<Vec<OsString>> {
    repository.validate()?;
    let repository_path = || {
        format!(
            "/repos/{}/{}",
            component(&repository.owner),
            component(&repository.name)
        )
    };
    let endpoint = match request {
        Request::User => "/user".into(),
        Request::Repository => repository_path(),
        Request::UserOrganizations { page } => {
            anyhow::ensure!((1..=MAX_PAGES).contains(&page), "Invalid GitHub API page");
            format!("/user/orgs?per_page={PAGE_SIZE}&page={page}")
        }
        Request::Pull { number } => {
            anyhow::ensure!(number > 0, "Invalid pull request number");
            format!("{}/pulls/{number}", repository_path())
        }
        Request::BranchRules { branch, page } => {
            anyhow::ensure!(
                !branch.is_empty()
                    && branch.len() <= MAX_BRANCH_BYTES
                    && !branch.chars().any(char::is_control),
                "Invalid branch name for GitHub API request"
            );
            anyhow::ensure!((1..=MAX_PAGES).contains(&page), "Invalid GitHub API page");
            format!(
                "{}/rules/branches/{}?per_page={PAGE_SIZE}&page={page}",
                repository_path(),
                component(branch)
            )
        }
        Request::Ruleset { id } => {
            anyhow::ensure!(id > 0, "Invalid GitHub ruleset ID");
            format!("{}/rulesets/{id}", repository_path())
        }
    };
    // Explicit components contain no gh placeholders; GH_REPO is also removed
    // from the child environment. No Link URL or caller endpoint is accepted.
    Ok(crate::args(&[
        "api",
        "--method",
        "GET",
        "--hostname",
        &repository.host,
        "--header",
        "Accept: application/vnd.github+json",
        &endpoint,
    ]))
}

fn component(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'.' | b'_' | b'~') {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[(byte >> 4) as usize]));
            encoded.push(char::from(HEX[(byte & 15) as usize]));
        }
    }
    encoded
}

/// Linear byte matching bounds redaction work even for adversarial repeated
/// prefixes. Keep unrelated bytes, including non-UTF8 output, untouched.
fn redact_credential(bytes: Vec<u8>, secret: &[u8]) -> Vec<u8> {
    if secret.is_empty() || bytes.len() < secret.len() {
        return bytes;
    }
    let mut prefix = vec![0; secret.len()];
    let mut matched = 0;
    for index in 1..secret.len() {
        while matched > 0 && secret[index] != secret[matched] {
            matched = prefix[matched - 1];
        }
        if secret[index] == secret[matched] {
            matched += 1;
        }
        prefix[index] = matched;
    }
    let replacement: &[u8] = if secret.len() < b"[redacted]".len() {
        b"*"
    } else {
        b"[redacted]"
    };
    let mut result = Vec::new();
    let mut copied = 0;
    matched = 0;
    for (index, byte) in bytes.iter().enumerate() {
        while matched > 0 && *byte != secret[matched] {
            matched = prefix[matched - 1];
        }
        if *byte == secret[matched] {
            matched += 1;
        }
        if matched == secret.len() {
            result.extend_from_slice(&bytes[copied..index + 1 - secret.len()]);
            result.extend_from_slice(replacement);
            copied = index + 1;
            matched = 0;
        }
    }
    if copied == 0 {
        return bytes;
    }
    result.extend_from_slice(&bytes[copied..]);
    // A deliberately unusual credential could occur in the marker or form
    // across replacement boundaries. Such an output must not escape either.
    matched = 0;
    for byte in &result {
        while matched > 0 && *byte != secret[matched] {
            matched = prefix[matched - 1];
        }
        if *byte == secret[matched] {
            matched += 1;
        }
        if matched == secret.len() {
            return Vec::new();
        }
    }
    result
}

fn credential(mut bytes: Vec<u8>) -> std::result::Result<String, Failure> {
    if bytes.last() == Some(&b'\n') {
        bytes.pop();
        if bytes.last() == Some(&b'\r') {
            bytes.pop();
        }
    }
    if bytes.is_empty()
        || bytes.len() > MAX_TOKEN_BYTES
        || bytes.iter().any(|byte| !byte.is_ascii_graphic())
    {
        return Err(Failure::InvalidCredential);
    }
    String::from_utf8(bytes).map_err(|_| Failure::InvalidCredential)
}

fn confirms_no_account(bytes: &[u8]) -> bool {
    if bytes.len() > MAX_JSON_BYTES {
        return false;
    }
    serde_json::from_slice::<Value>(bytes)
        .ok()
        .and_then(|value| {
            value
                .as_object()?
                .get("hosts")?
                .as_object()
                .map(|hosts| hosts.is_empty())
        })
        .unwrap_or(false)
}

fn graphql_response(bytes: &[u8]) -> std::result::Result<Value, Failure> {
    if bytes.len() > MAX_JSON_BYTES {
        return Err(Failure::ResponseLimit);
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    if let Some(errors) = value.get("errors").filter(|errors| !errors.is_null()) {
        let errors = errors.as_array().ok_or(Failure::InvalidResponse)?;
        if !errors.is_empty() {
            return Err(Failure::GhExit { code: 1 });
        }
    }
    value
        .get("data")
        .filter(|data| data.is_object())
        .cloned()
        .ok_or(Failure::InvalidResponse)
}

fn response(request: Request<'_>, bytes: &[u8]) -> std::result::Result<Value, Failure> {
    if bytes.len() > MAX_JSON_BYTES {
        return Err(Failure::ResponseLimit);
    }
    let value: Value = serde_json::from_slice(bytes).map_err(|_| Failure::InvalidResponse)?;
    match request {
        Request::BranchRules { .. } | Request::UserOrganizations { .. } => {
            let rows = value.as_array().ok_or(Failure::InvalidResponse)?;
            if rows.len() > PAGE_SIZE {
                return Err(Failure::ResponseLimit);
            }
            if !rows.iter().all(Value::is_object) {
                return Err(Failure::InvalidResponse);
            }
        }
        _ if !value.is_object() => return Err(Failure::InvalidResponse),
        _ => {}
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    fn repository() -> RepositoryIdentity {
        RepositoryIdentity {
            host: "github.com".into(),
            owner: "canonical-owner".into(),
            name: "repository.name".into(),
        }
    }
    fn arguments(request: Request<'_>) -> Vec<String> {
        request_arguments(&repository(), request)
            .unwrap()
            .into_iter()
            .map(|value| value.into_string().unwrap())
            .collect()
    }
    #[test]
    fn graphql_errors_and_incomplete_envelopes_cannot_certify_mutation_success() {
        for value in [
            serde_json::json!({"data":{"createPullRequest":{"pullRequest":{"id":"PR_1"}}},"errors":[{"message":"private response"}]}),
            serde_json::json!({"errors":[]}),
            serde_json::json!({"data":null}),
            serde_json::json!({"data":{},"errors":"not an array"}),
        ] {
            assert!(graphql_response(&serde_json::to_vec(&value).unwrap()).is_err());
        }
        assert!(graphql_response(&vec![b' '; MAX_JSON_BYTES + 1]).is_err());
        assert_eq!(
            graphql_response(br#"{"data":{"repository":{"id":"R_1"}},"errors":[]}"#).unwrap(),
            serde_json::json!({"repository":{"id":"R_1"}})
        );
    }
    #[test]
    fn api_paths_are_fixed_to_explicit_host_and_repository() {
        let prefix = [
            "api",
            "--method",
            "GET",
            "--hostname",
            "github.com",
            "--header",
            "Accept: application/vnd.github+json",
        ];
        for (request, endpoint) in [
            (Request::User, "/user"),
            (
                Request::Repository,
                "/repos/canonical-owner/repository.name",
            ),
            (
                Request::Ruleset {
                    id: 9007199254740991,
                },
                "/repos/canonical-owner/repository.name/rulesets/9007199254740991",
            ),
        ] {
            let actual = arguments(request);
            assert_eq!(&actual[..actual.len() - 1], prefix);
            assert_eq!(actual.last().unwrap(), endpoint);
            assert!(
                !actual
                    .iter()
                    .any(|argument| argument == "--repo" || argument.contains("{owner}"))
            );
        }
        let mut custom = repository();
        custom.host = "localhost:8443".into();
        assert_eq!(
            request_arguments(&custom, Request::User).unwrap()[4],
            "localhost:8443"
        );
    }
    #[test]
    fn whole_branch_is_exactly_one_percent_encoded_utf8_segment() {
        assert_eq!(
            arguments(Request::BranchRules {
                branch: "feature/雪/%2F?x=#{}'",
                page: 2
            })
            .last()
            .unwrap(),
            "/repos/canonical-owner/repository.name/rules/branches/feature%2F%E9%9B%AA%2F%252F%3Fx%3D%23%7B%7D%27?per_page=100&page=2"
        );
        assert_eq!(component("AZaz09-._~"), "AZaz09-._~");
        let branch = "é".repeat(MAX_BRANCH_BYTES / 2);
        assert!(
            request_arguments(
                &repository(),
                Request::BranchRules {
                    branch: &branch,
                    page: MAX_PAGES
                }
            )
            .is_ok()
        );
        for branch in ["", "bad\nbranch", "bad\0branch"] {
            let error = request_arguments(&repository(), Request::BranchRules { branch, page: 1 })
                .unwrap_err();
            assert!(!error.to_string().contains(branch) || branch.is_empty());
        }
        assert!(
            request_arguments(
                &repository(),
                Request::BranchRules {
                    branch: &"a".repeat(MAX_BRANCH_BYTES + 1),
                    page: 1
                }
            )
            .is_err()
        );
        for page in [0, MAX_PAGES + 1] {
            assert!(
                request_arguments(
                    &repository(),
                    Request::BranchRules {
                        branch: "main",
                        page
                    }
                )
                .is_err()
            );
        }
        assert!(request_arguments(&repository(), Request::Ruleset { id: 0 }).is_err());
        let mut invalid = repository();
        invalid.owner = "Owner".into();
        assert!(request_arguments(&invalid, Request::User).is_err());
    }
    #[test]
    fn token_capture_accepts_one_line_and_never_formats_secret_bytes() {
        for bytes in [
            b"synthetic".to_vec(),
            b"synthetic\n".to_vec(),
            b"synthetic\r\n".to_vec(),
        ] {
            assert_eq!(credential(bytes).unwrap(), "synthetic");
        }
        assert!(credential(vec![b'x'; MAX_TOKEN_BYTES]).is_ok());
        for bytes in [
            vec![],
            b"\n".to_vec(),
            b"synthetic\n\n".to_vec(),
            b"synthetic\r".to_vec(),
            b"synthetic secret".to_vec(),
            vec![255],
            vec![b'x'; MAX_TOKEN_BYTES + 1],
        ] {
            let error = credential(bytes).unwrap_err();
            assert_eq!(error, Failure::InvalidCredential);
            assert!(!format!("{error:?} {error}").contains("synthetic"));
        }
        assert_eq!(
            auth_arguments("github.com", false),
            crate::args(&["auth", "token", "--hostname", "github.com", "--no-refresh"])
        );
    }
    #[test]
    fn only_bounded_explicit_empty_host_status_proves_no_account() {
        assert!(confirms_no_account(br#"{"hosts":{}}"#));
        for bytes in [
            b"synthetic-secret".as_slice(),
            br#"{}"#,
            br#"{"hosts":[]}"#,
            br#"{"hosts":{"github.com":[]}}"#,
            br#"{"hosts":{"github.com":[{"state":"error"}]}}"#,
        ] {
            assert!(!confirms_no_account(bytes));
        }
        let failure = Failure::NoAccount { code: 1 };
        assert!(failure.is_no_account());
        assert_eq!(failure.exit_code(), Some(1));
        assert!(!Failure::GhExit { code: 1 }.is_no_account());
        assert_eq!(Failure::GhExit { code: 4 }.exit_code(), Some(4));
        assert_eq!(Failure::Transport.exit_code(), None);
    }
    #[test]
    fn typed_output_redaction_preserves_binary_bytes_and_removes_all_literal_credentials() {
        let secret = b"synthetic-private-token";
        let input = [
            b"prefix\xff ".as_slice(),
            secret,
            b" middle ",
            secret,
            b" suffix\0",
        ]
        .concat();
        assert_eq!(
            redact_credential(input, secret),
            b"prefix\xff [redacted] middle [redacted] suffix\0"
        );
        assert_eq!(
            redact_credential(b"unrelated\xff".to_vec(), secret),
            b"unrelated\xff"
        );
        assert_eq!(
            redact_credential(b"aaaaaaaaab-aaaaaaaaab".to_vec(), b"aaaaaaaaab"),
            b"[redacted]-[redacted]"
        );
        assert!(redact_credential(b"secret [redacted]".to_vec(), b"[redacted]").is_empty());
        assert_eq!(redact_credential(b"[secret".to_vec(), b"["), b"*secret");
        let short = redact_credential(vec![b'z'; 2 * 1024 * 1024], b"z");
        assert_eq!(short.len(), 2 * 1024 * 1024);
        assert!(short.iter().all(|byte| *byte == b'*'));
        let mut repeated = vec![b'a'; 1024 * 1024];
        repeated.extend_from_slice(b"b");
        let mut long = vec![b'a'; MAX_TOKEN_BYTES - 1];
        long.push(b'b');
        let output = redact_credential(repeated, &long);
        assert!(output.ends_with(b"[redacted]"));
        assert_eq!(
            output.len(),
            1024 * 1024 + 1 - MAX_TOKEN_BYTES + b"[redacted]".len()
        );
    }

    #[test]
    fn git_credential_responses_bind_named_usernames_and_keep_sessions_send_sync() {
        fn send_sync<T: Send + Sync>() {}
        send_sync::<Session>();
        let mut session = Session {
            path: PathBuf::from("unused"),
            repository: repository(),
            token: "synthetic-private-git-token".into(),
            account: Some(ExpectedAccount {
                login: "ChosenAccount".into(),
                id: Some(42),
            }),
        };
        for username in ["ChosenAccount", "chosenaccount", "CHOSENACCOUNT"] {
            let response = session.git_credential_response(username).unwrap();
            let expected = format!("username={username}\npassword={}\n\n", session.token);
            assert!(response == expected.as_bytes());
        }
        session.account = None;
        let response = session.git_credential_response("another-account").unwrap();
        assert!(response == b"username=another-account\npassword=synthetic-private-git-token\n\n");
    }

    #[test]
    fn git_credential_response_errors_never_echo_usernames_or_credentials() {
        let mut session = Session {
            path: PathBuf::from("unused"),
            repository: repository(),
            token: "synthetic-private-git-token".into(),
            account: Some(ExpectedAccount {
                login: "ChosenAccount".into(),
                id: Some(42),
            }),
        };
        for username in ["other-account", "synthetic-private-git-token"] {
            let error = session.git_credential_response(username).unwrap_err();
            assert_eq!(
                error.to_string(),
                "Git credential username does not match the assigned account"
            );
            assert!(!format!("{error:?} {error}").contains(&session.token));
            assert!(!format!("{error:?} {error}").contains(username));
        }
        for username in ["", "--private-user", "private\nuser", "private user"] {
            let error = session.git_credential_response(username).unwrap_err();
            assert_eq!(error.to_string(), "Invalid Git credential username");
            assert!(!format!("{error:?} {error}").contains(&session.token));
        }
        session.token.push('\n');
        let error = session
            .git_credential_response("ChosenAccount")
            .unwrap_err();
        assert!(!format!("{error:?} {error}").contains("synthetic-private-git-token"));
    }

    #[test]
    fn session_output_redaction_preserves_exit_status_and_unrelated_binary_bytes() {
        let session = Session {
            path: PathBuf::from("unused"),
            repository: repository(),
            token: "synthetic-private-git-token".into(),
            account: None,
        };
        let output = session.redact_output(process::RawOutput {
            code: 17,
            stdout: b"prefix\xff synthetic-private-git-token suffix\0".to_vec(),
            stderr: b"synthetic-private-git-token synthetic-private-git-token\xfe".to_vec(),
        });
        assert_eq!(output.code, 17);
        assert_eq!(output.stdout, b"prefix\xff [redacted] suffix\0");
        assert_eq!(output.stderr, b"[redacted] [redacted]\xfe");
    }

    #[test]
    fn verified_actor_redacts_all_base64_credential_encodings() {
        use base64::Engine as _;
        let session = Session {
            path: PathBuf::from("unused"),
            repository: repository(),
            token: "SyntheticAlphaToken123456".into(),
            account: None,
        };
        let basic = format!("Alice:{}", session.token);
        for engine in [
            base64::engine::general_purpose::STANDARD,
            base64::engine::general_purpose::STANDARD_NO_PAD,
            base64::engine::general_purpose::URL_SAFE,
            base64::engine::general_purpose::URL_SAFE_NO_PAD,
        ] {
            for encoded in [engine.encode(&session.token), engine.encode(&basic)] {
                let output = session.redact_output_for_login(
                    process::RawOutput {
                        code: 0,
                        stdout: encoded.as_bytes().to_vec(),
                        stderr: encoded.as_bytes().to_vec(),
                    },
                    "Alice",
                );
                assert!(
                    !output
                        .stdout
                        .windows(encoded.len())
                        .any(|s| s == encoded.as_bytes())
                );
                assert!(
                    !output
                        .stderr
                        .windows(encoded.len())
                        .any(|s| s == encoded.as_bytes())
                );
            }
        }
    }

    #[test]
    fn named_user_selection_preserves_catalog_spelling_and_verifies_server_identity() {
        assert_eq!(
            token_arguments("github.com", Some("ChosenAccount")),
            crate::args(&[
                "auth",
                "token",
                "--hostname",
                "github.com",
                "--user",
                "ChosenAccount",
                "--no-refresh"
            ])
        );
        let expected = ExpectedAccount {
            login: "ChosenAccount".into(),
            id: Some(42),
        };
        assert!(matches_account(
            &json!({"login":"chosenaccount","id":42}),
            &expected
        ));
        for value in [
            json!({"login":"other","id":42}),
            json!({"login":"ChosenAccount","id":43}),
            json!({"login":"ChosenAccount","id":0}),
            json!({"login":"ChosenAccount","id":"42"}),
            json!({"login":"ChosenAccount"}),
        ] {
            assert!(!matches_account(&value, &expected));
        }
        let without_id = ExpectedAccount {
            login: "ChosenAccount".into(),
            id: None,
        };
        assert!(matches_account(
            &json!({"login":"ChosenAccount","id":43}),
            &without_id
        ));
        for login in [
            "",
            "--help",
            ".",
            "..",
            "bad\nlogin",
            "bad login",
            "host/user",
        ] {
            assert!(!valid_login(login));
        }
        assert!(!valid_login(&"a".repeat(257)));
        assert!(valid_login("test-user[bot]"));
        assert_eq!(Failure::AccountMismatch.exit_code(), None);
        assert!(!Failure::AccountMismatch.is_no_account());
    }
    #[tokio::test]
    async fn assigned_account_host_and_id_are_validated_before_spawning_gh() {
        for chosen in [
            ChosenAccount {
                host: "foreign.example",
                login: "ChosenAccount",
                id: Some(42),
            },
            ChosenAccount {
                host: "github.com",
                login: "ChosenAccount",
                id: Some(0),
            },
            ChosenAccount {
                host: "github.com",
                login: "--help",
                id: None,
            },
        ] {
            assert!(
                Session::open_for_account(
                    Path::new("/unopened-assignment-fixture"),
                    &repository(),
                    Some(chosen)
                )
                .await
                .is_err()
            );
        }
    }
    #[test]
    fn account_catalog_is_fixed_host_bounded_and_contains_only_safe_account_hints() {
        let raw = json!({"hosts":{"github.com":[{
            "host":"github.com","login":"ChosenAccount","active":false,"state":"success",
            "gitProtocol":"ssh","tokenSource":"private-secret-path","oauthToken":"private-secret",
            "token":"private-secret","scopes":"private-secret","error":"private-secret",
            "unknown":{"token":"private-secret"}
        }]}});
        let accounts = catalog_response("github.com", &serde_json::to_vec(&raw).unwrap()).unwrap();
        assert_eq!(
            accounts,
            vec![CatalogAccount {
                host: "github.com".into(),
                login: "ChosenAccount".into(),
                active: false,
                state: "success".into(),
                token_source: None,
                git_protocol: Some("ssh".into())
            }]
        );
        assert!(
            !serde_json::to_string(&accounts)
                .unwrap()
                .contains("private-secret")
        );
        assert_eq!(
            catalog_response("github.com", br#"{"hosts":{}}"#).unwrap(),
            vec![]
        );
        let unknown = json!({"hosts":{"github.com":[{"login":"other","state":"private-secret","gitProtocol":"private-secret","tokenSource":"keyring"}]}});
        let account = catalog_response("github.com", &serde_json::to_vec(&unknown).unwrap())
            .unwrap()
            .remove(0);
        assert_eq!(account.state, "unknown");
        assert_eq!(account.git_protocol, None);
        assert_eq!(account.token_source, Some("keyring".into()));
        for raw in [
            json!({}),
            json!({"hosts":[]}),
            json!({"hosts":{"foreign.example":[]}}),
            json!({"hosts":{"github.com":[{"login":"bad login"}]}}),
            json!({"hosts":{"github.com":[{"login":"account","host":"foreign.example"}]}}),
            json!({"hosts":{"github.com":[{"login":"account","active":"true"}]}}),
            json!({"hosts":{"github.com":[{"login":"account"},{"login":"Account"}]}}),
        ] {
            assert_eq!(
                catalog_response("github.com", &serde_json::to_vec(&raw).unwrap()),
                Err(Failure::InvalidResponse)
            );
        }
        let rows: Vec<_> = (0..=MAX_ACCOUNTS)
            .map(|n| json!({"login":format!("account-{n}")}))
            .collect();
        assert_eq!(
            catalog_response(
                "github.com",
                &serde_json::to_vec(&json!({"hosts":{"github.com":rows}})).unwrap()
            ),
            Err(Failure::ResponseLimit)
        );
        assert_eq!(
            catalog_response("github.com", &vec![b' '; MAX_JSON_BYTES + 1]),
            Err(Failure::ResponseLimit)
        );
    }

    #[test]
    fn api_response_limits_and_shapes_fail_without_diagnostics() {
        assert_eq!(
            response(Request::User, b"synthetic-secret"),
            Err(Failure::InvalidResponse)
        );
        assert_eq!(
            response(Request::User, b"[]"),
            Err(Failure::InvalidResponse)
        );
        assert_eq!(
            response(Request::User, &vec![b' '; MAX_JSON_BYTES + 1]),
            Err(Failure::ResponseLimit)
        );
        assert_eq!(
            response(
                Request::BranchRules {
                    branch: "main",
                    page: 1
                },
                br#"["synthetic-secret"]"#
            ),
            Err(Failure::InvalidResponse)
        );
        let page = json!(vec![json!({"type":"unknown"}); PAGE_SIZE]);
        assert_eq!(
            response(
                Request::BranchRules {
                    branch: "main",
                    page: 1
                },
                &serde_json::to_vec(&page).unwrap()
            )
            .unwrap(),
            page
        );
        let oversized = json!(vec![json!({}); PAGE_SIZE + 1]);
        assert_eq!(
            response(
                Request::BranchRules {
                    branch: "main",
                    page: 1
                },
                &serde_json::to_vec(&oversized).unwrap()
            ),
            Err(Failure::ResponseLimit)
        );
        assert_eq!(response(Request::Ruleset { id: 1 }, b"{}"), Ok(json!({})));
    }
}
