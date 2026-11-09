//! GitHub services backed by the installed GitHub CLI and its credential store.
use crate::{args, process};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::path::Path;

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GitHubRequest {
    /// Optional explicit [HOST/]OWNER/REPO; bound operations select their fetch identity.
    pub repository: Option<String>,
    /// Optional saved-account/source witness captured when an interactive request was made.
    /// Omission deliberately uses the current account when dispatching a CLI request.
    #[serde(default)]
    pub account_basis: Option<String>,
    pub action: GitHubAction,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
pub enum GitHubAction {
    AuthStatus {
        hostname: Option<String>,
    },
    Repository,
    PullRequests {
        #[serde(default)]
        state: PullRequestState,
        #[serde(default = "default_limit")]
        limit: u16,
    },
    PullRequest {
        number: u64,
    },
    PullRequestChecks {
        number: u64,
    },
    CreatePullRequest {
        title: String,
        body: String,
        base: String,
        head: String,
        #[serde(default)]
        draft: bool,
    },
    CheckoutPullRequest {
        number: u64,
    },
    ReviewPullRequest {
        number: u64,
        review: Review,
        body: String,
    },
    MergePullRequest {
        number: u64,
        strategy: MergeStrategy,
        head_commit: String,
    },
    Issues {
        #[serde(default)]
        state: IssueState,
        #[serde(default = "default_limit")]
        limit: u16,
    },
    Issue {
        number: u64,
    },
    CreateIssue {
        title: String,
        body: String,
    },
    Comment {
        number: u64,
        body: String,
    },
    CloseIssue {
        number: u64,
    },
    ReopenIssue {
        number: u64,
    },
    WorkflowRuns {
        #[serde(default = "default_limit")]
        limit: u16,
    },
    WorkflowRun {
        id: u64,
    },
    RerunWorkflow {
        id: u64,
        #[serde(default)]
        failed_only: bool,
    },
}

fn default_limit() -> u16 {
    30
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PullRequestState {
    #[default]
    Open,
    Closed,
    Merged,
    All,
}
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum IssueState {
    #[default]
    Open,
    Closed,
    All,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Review {
    Approve,
    RequestChanges,
    Comment,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeStrategy {
    Merge,
    Squash,
    Rebase,
}

/// Nonzero GitHub CLI codes remain visible, including pending/failed checks.
#[derive(Serialize)]
pub struct GitHubOutput {
    pub code: i32,
    pub data: Option<Value>,
    pub stdout: String,
    pub stderr: String,
    pub hint: Option<String>,
}

impl GitHubRequest {
    pub fn is_auth_status(&self) -> bool {
        matches!(self.action, GitHubAction::AuthStatus { .. })
    }
}

/// Execute a fixed operation. This API does not accept shell commands or arbitrary API endpoints.
pub async fn execute_github(path: &Path, request: GitHubRequest) -> Result<Value> {
    anyhow::ensure!(
        request.account_basis.is_none() || request.is_auth_status(),
        "A saved-account review basis requires a working tree and its repository scope"
    );
    execute_github_inner(path, request, None).await
}
pub(crate) async fn execute_github_session(
    path: &Path,
    request: GitHubRequest,
    session: &crate::github_api::Session,
) -> Result<Value> {
    anyhow::ensure!(
        !matches!(
            request.action,
            GitHubAction::CreatePullRequest { .. } | GitHubAction::CheckoutPullRequest { .. }
        ),
        "Use the repository-scoped pull request workflow for assigned credentials"
    );
    execute_github_inner(path, request, Some(session)).await
}
async fn execute_github_inner(
    path: &Path,
    request: GitHubRequest,
    session: Option<&crate::github_api::Session>,
) -> Result<Value> {
    use GitHubAction::*;
    if let Some(repository) = &request.repository {
        validate_repository(repository)?;
    }
    let auth_status = request.is_auth_status();
    let remote_mutation = matches!(
        &request.action,
        GitHubAction::CreatePullRequest { .. }
            | GitHubAction::ReviewPullRequest { .. }
            | GitHubAction::MergePullRequest { .. }
            | GitHubAction::CreateIssue { .. }
            | GitHubAction::Comment { .. }
            | GitHubAction::CloseIssue { .. }
            | GitHubAction::ReopenIssue { .. }
            | GitHubAction::RerunWorkflow { .. }
    );
    let mut input = None;
    let mut json_output = true;
    let mut command = match request.action {
        AuthStatus { hostname } => {
            let mut command = args(&["auth", "status", "--json", "hosts", "--no-refresh"]);
            if let Some(host) = hostname {
                validate_host(&host)?;
                command.extend(args(&["--hostname", &host]));
            }
            command
        }
        Repository => args(&[
            "repo",
            "view",
            "--json",
            "nameWithOwner,url,description,defaultBranchRef,isPrivate,isFork,parent,viewerPermission",
        ]),
        PullRequests { state, limit } => {
            validate_limit(limit)?;
            let state = match state {
                PullRequestState::Open => "open",
                PullRequestState::Closed => "closed",
                PullRequestState::Merged => "merged",
                PullRequestState::All => "all",
            };
            args(&[
                "pr",
                "list",
                "--state",
                state,
                "--limit",
                &limit.to_string(),
                "--json",
                "number,title,url,state,isDraft,headRefName,baseRefName,author,updatedAt,reviewDecision",
            ])
        }
        PullRequest { number } => args(&[
            "pr",
            "view",
            &positive(number)?,
            "--json",
            "number,title,body,url,state,isDraft,headRefName,headRefOid,baseRefName,author,mergeable,mergeStateStatus,reviewDecision,comments,reviews,files,statusCheckRollup",
        ]),
        PullRequestChecks { number } => args(&[
            "pr",
            "checks",
            &positive(number)?,
            "--json",
            "name,state,bucket,link,workflow,description",
        ]),
        CreatePullRequest {
            title,
            body,
            base,
            head,
            draft,
        } => {
            validate_title(&title)?;
            validate_text(&body)?;
            validate_ref(&base)?;
            validate_ref(&head)?;
            input = Some(body.into_bytes());
            json_output = false;
            let mut command = args(&[
                "pr",
                "create",
                "--title",
                &title,
                "--body-file",
                "-",
                "--base",
                &base,
                "--head",
                &head,
            ]);
            if draft {
                command.push("--draft".into());
            }
            command
        }
        CheckoutPullRequest { number } => {
            json_output = false;
            args(&["pr", "checkout", &positive(number)?])
        }
        ReviewPullRequest {
            number,
            review,
            body,
        } => {
            validate_text(&body)?;
            input = Some(body.into_bytes());
            json_output = false;
            let flag = match review {
                Review::Approve => "--approve",
                Review::RequestChanges => "--request-changes",
                Review::Comment => "--comment",
            };
            args(&["pr", "review", &positive(number)?, flag, "--body-file", "-"])
        }
        MergePullRequest {
            number,
            strategy,
            head_commit,
        } => {
            // Pin the reviewed head: concurrent pushes must not merge unseen commits.
            if !matches!(head_commit.len(), 40 | 64)
                || !head_commit.bytes().all(|b| b.is_ascii_hexdigit())
            {
                bail!("head_commit must be the full reviewed commit SHA");
            }
            json_output = false;
            let flag = match strategy {
                MergeStrategy::Merge => "--merge",
                MergeStrategy::Squash => "--squash",
                MergeStrategy::Rebase => "--rebase",
            };
            args(&[
                "pr",
                "merge",
                &positive(number)?,
                flag,
                "--match-head-commit",
                &head_commit,
            ])
        }
        Issues { state, limit } => {
            validate_limit(limit)?;
            let state = match state {
                IssueState::Open => "open",
                IssueState::Closed => "closed",
                IssueState::All => "all",
            };
            args(&[
                "issue",
                "list",
                "--state",
                state,
                "--limit",
                &limit.to_string(),
                "--json",
                "number,title,url,state,author,labels,updatedAt",
            ])
        }
        Issue { number } => args(&[
            "issue",
            "view",
            &positive(number)?,
            "--json",
            "number,title,body,url,state,author,labels,comments,assignees,updatedAt",
        ]),
        CreateIssue { title, body } => {
            validate_title(&title)?;
            validate_text(&body)?;
            input = Some(body.into_bytes());
            json_output = false;
            args(&["issue", "create", "--title", &title, "--body-file", "-"])
        }
        Comment { number, body } => {
            validate_text(&body)?;
            if body.trim().is_empty() {
                bail!("comment body must not be empty");
            }
            input = Some(body.into_bytes());
            json_output = false;
            args(&["issue", "comment", &positive(number)?, "--body-file", "-"])
        }
        CloseIssue { number } => {
            json_output = false;
            args(&["issue", "close", &positive(number)?])
        }
        ReopenIssue { number } => {
            json_output = false;
            args(&["issue", "reopen", &positive(number)?])
        }
        WorkflowRuns { limit } => {
            validate_limit(limit)?;
            args(&[
                "run",
                "list",
                "--limit",
                &limit.to_string(),
                "--json",
                "databaseId,displayTitle,status,conclusion,headBranch,headSha,url,workflowName,updatedAt",
            ])
        }
        WorkflowRun { id } => args(&[
            "run",
            "view",
            &positive(id)?,
            "--json",
            "databaseId,displayTitle,status,conclusion,headBranch,headSha,url,workflowName,jobs",
        ]),
        RerunWorkflow { id, failed_only } => {
            json_output = false;
            let mut command = args(&["run", "rerun", &positive(id)?]);
            if failed_only {
                command.push("--failed".into());
            }
            command
        }
    };
    if !auth_status && let Some(repository) = request.repository {
        if command.first().is_some_and(|part| part == "repo") {
            command.push(repository.into());
        } else {
            command.extend(args(&["--repo", &repository]));
        }
    }
    if remote_mutation {
        crate::cancellation::Cancellation::current().mark_remote_mutation();
    }
    let raw = match session {
        Some(session) => session.run(&command, input).await?,
        None => process::run_gh(path, &command, input).await?,
    };
    let mut data = if json_output && !raw.stdout.is_empty() {
        match serde_json::from_slice(&raw.stdout) {
            Ok(value) => Some(value),
            Err(_) if raw.code != 0 => None,
            Err(error) => return Err(error).context("GitHub CLI returned invalid JSON"),
        }
    } else {
        None
    };
    if auth_status {
        data = Some(sanitize_auth(data.unwrap_or_else(|| json!({"hosts":{}}))));
    }
    let text = raw.text();
    let hint = match text.code {
        4 => Some("Authentication required: run desktop-rs gh auth login in Termux, then retry.".to_owned()),
        8 => Some("Checks are pending; refresh to see their current state.".to_owned()),
        0 => None,
        _ => Some("Inspect the GitHub CLI error. Check authentication, network access, repository permissions, and the selected host before retrying.".to_owned()),
    };
    Ok(serde_json::to_value(GitHubOutput {
        code: text.code,
        data,
        stdout: if json_output || auth_status {
            String::new()
        } else {
            text.stdout
        },
        stderr: text.stderr,
        hint,
    })?)
}

fn sanitize_auth(value: Value) -> Value {
    let mut hosts = serde_json::Map::new();
    if let Some(entries) = value.get("hosts").and_then(Value::as_object) {
        for (hostname, accounts) in entries {
            let safe: Vec<Value> = accounts
                .as_array()
                .into_iter()
                .flatten()
                .map(|account| {
                    let mut safe = serde_json::Map::new();
                    for key in [
                        "host",
                        "login",
                        "state",
                        "active",
                        "gitProtocol",
                        "tokenSource",
                        "scopes",
                    ] {
                        if let Some(value) = account.get(key) {
                            safe.insert(key.to_owned(), value.clone());
                        }
                    }
                    Value::Object(safe)
                })
                .collect();
            hosts.insert(hostname.clone(), Value::Array(safe));
        }
    }
    json!({"hosts":hosts})
}

fn validate_limit(limit: u16) -> Result<()> {
    if !(1..=100).contains(&limit) {
        bail!("limit must be between 1 and 100");
    }
    Ok(())
}
fn positive(number: u64) -> Result<String> {
    if number == 0 {
        bail!("number must be positive");
    }
    Ok(number.to_string())
}
pub(crate) fn validate_text(text: &str) -> Result<()> {
    if text.len() > 1024 * 1024 || text.contains('\0') {
        bail!("text contains NUL or exceeds 1 MiB");
    }
    Ok(())
}
pub(crate) fn validate_title(title: &str) -> Result<()> {
    validate_text(title)?;
    if title.trim().is_empty() || title.contains(['\n', '\r']) {
        bail!("title must be a nonempty single line");
    }
    Ok(())
}
pub(crate) fn validate_ref(reference: &str) -> Result<()> {
    if reference.is_empty() || reference.starts_with('-') || reference.contains(['\0', '\n', '\r'])
    {
        bail!("invalid branch reference");
    }
    Ok(())
}
pub(crate) fn validate_host(host: &str) -> Result<()> {
    let (hostname, port) = host
        .split_once(':')
        .map_or((host, None), |(h, p)| (h, Some(p)));
    if hostname.is_empty()
        || hostname.starts_with('-')
        || !hostname
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b".-".contains(&b))
        || port.is_some_and(|p| p.parse::<u16>().map_or(true, |number| number == 0))
    {
        bail!("invalid GitHub hostname");
    }
    Ok(())
}
pub(crate) fn validate_repository(repository: &str) -> Result<()> {
    let parts: Vec<_> = repository.split('/').collect();
    let rest = match parts.as_slice() {
        [_, _] => parts.as_slice(),
        [host, _, _] => {
            validate_host(host)?;
            &parts[1..]
        }
        _ => bail!("repository must be [HOST/]OWNER/REPO"),
    };
    if rest[0].starts_with('-')
        || rest.iter().any(|part| {
            part.is_empty()
                || *part == "."
                || *part == ".."
                || !part
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b))
        })
    {
        bail!("invalid repository identifier");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn unbound_requests_cannot_silently_discard_saved_account_intent() {
        let request = GitHubRequest {
            repository: Some("owner/repository".into()),
            account_basis: Some("saved-review".into()),
            action: GitHubAction::Repository,
        };
        let error = execute_github(Path::new("/desktop-account-nonexistent-test-path"), request)
            .await
            .unwrap_err();
        assert!(error.to_string().contains("repository scope"));
    }
    #[test]
    fn strips_auth_secrets() {
        let result = sanitize_auth(
            json!({"hosts":{"github.com":[{"login":"user","active":true,"oauthToken":"secret","token":"secret","unexpected":{"token":"secret"}}]}}),
        );
        assert_eq!(
            result,
            json!({"hosts":{"github.com":[{"login":"user","active":true}]}})
        );
    }
    #[test]
    fn validates_repository_and_host_arguments() {
        for value in [
            "owner/repo",
            "owner/--help",
            "enterprise.example:8443/owner/-repo",
        ] {
            assert!(validate_repository(value).is_ok());
        }
        for value in [
            "--help",
            "https://github.com/owner/repo",
            "--repo/value",
            "-owner/repo",
            "host:0/owner/repo",
            "owner/../repo",
        ] {
            assert!(validate_repository(value).is_err());
        }
    }
}
