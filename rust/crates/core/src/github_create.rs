//! Assigned-account PR creation uses fixed HTTP-only gh API requests.
use crate::{
    Repository, RepositoryIdentity,
    github::{validate_ref, validate_text, validate_title},
    github_api::{Failure, MAX_PAGES, PullRequestInput, Request, Session},
    process::RawOutput,
};
use anyhow::{Context, Result, ensure};
use serde_json::{Value, json};
use std::collections::HashSet;

pub(crate) struct Draft<'a> {
    pub title: &'a str,
    pub body: &'a str,
    pub base: &'a str,
    pub head: &'a str,
    pub draft: bool,
}
struct QualifiedHead<'a> {
    branch: &'a str,
    label: String,
}
impl<'a> QualifiedHead<'a> {
    fn parse(value: &'a str) -> Result<Self> {
        validate_ref(value)?;
        let (owner, branch) = value.split_once(':').unwrap_or(("", value));
        ensure!(
            !branch.is_empty() && !branch.contains(':'),
            "Invalid qualified pull request head"
        );
        Ok(Self {
            branch,
            label: if owner.is_empty() {
                branch.to_owned()
            } else {
                value.to_owned()
            },
        })
    }
}
struct CreateContext {
    repository_id: String,
    duplicate: Option<String>,
    after: Option<String>,
}
fn opaque(value: &Value, maximum: usize) -> Result<&str> {
    value
        .as_str()
        .filter(|value| {
            !value.is_empty()
                && value.len() <= maximum
                && value.bytes().all(|b| b.is_ascii_graphic())
        })
        .context("Invalid GitHub identifier")
}
fn repository_url(url: &str, repository: &RepositoryIdentity) -> bool {
    let Some(rest) = url.strip_prefix("https://") else {
        return false;
    };
    !url.chars().any(|c| c.is_control() || c.is_whitespace())
        && !url.contains(['?', '#'])
        && !rest.split('/').next().unwrap_or_default().contains('@')
        && RepositoryIdentity::from_url(url).is_ok_and(|identity| identity == *repository)
}
fn pull_url(value: &Value, repository: &RepositoryIdentity) -> Result<String> {
    let url = value
        .as_str()
        .filter(|url| url.len() <= 16 * 1024)
        .context("Invalid GitHub pull request URL")?;
    let (base, number) = url
        .rsplit_once("/pull/")
        .context("Invalid GitHub pull request URL")?;
    ensure!(
        repository_url(base, repository)
            && !number.is_empty()
            && number.bytes().all(|b| b.is_ascii_digit())
            && number.parse::<u64>().is_ok_and(|n| n > 0),
        "GitHub pull request URL does not match the selected repository"
    );
    Ok(url.to_owned())
}
fn context(
    value: &Value,
    repository: &RepositoryIdentity,
    base: &str,
    head: &QualifiedHead<'_>,
) -> Result<CreateContext> {
    let data = &value["repository"];
    let repository_id = opaque(&data["id"], 1024)?.to_owned();
    ensure!(
        data["nameWithOwner"]
            .as_str()
            .is_some_and(|name| name
                .eq_ignore_ascii_case(&format!("{}/{}", repository.owner, repository.name)))
            && data["url"]
                .as_str()
                .is_some_and(|url| repository_url(url, repository)),
        "GitHub repository does not match the selected repository"
    );
    let connection = &data["pullRequests"];
    let rows = connection["nodes"]
        .as_array()
        .context("Invalid GitHub pull request candidates")?;
    ensure!(rows.len() <= 100, "Too many GitHub pull request candidates");
    for row in rows {
        let branch = row["headRefName"]
            .as_str()
            .context("Invalid GitHub pull request head")?;
        let target = row["baseRefName"]
            .as_str()
            .context("Invalid GitHub pull request base")?;
        let cross = row["isCrossRepository"]
            .as_bool()
            .context("Invalid GitHub pull request source")?;
        ensure!(
            row["state"] == "OPEN"
                && !branch.is_empty()
                && branch.len() <= 8192
                && !branch.chars().any(char::is_control)
                && !target.is_empty()
                && target.len() <= 8192
                && !target.chars().any(char::is_control),
            "Invalid GitHub pull request candidate"
        );
        let label = if cross {
            format!(
                "{}:{branch}",
                opaque(&row["headRepositoryOwner"]["login"], 256)?
            )
        } else {
            branch.to_owned()
        };
        if target == base && label == head.label {
            return Ok(CreateContext {
                repository_id,
                duplicate: Some(pull_url(&row["url"], repository)?),
                after: None,
            });
        }
    }
    let more = connection["pageInfo"]["hasNextPage"]
        .as_bool()
        .context("Incomplete GitHub pull request candidates")?;
    let after = if more {
        ensure!(
            !rows.is_empty(),
            "Incomplete GitHub pull request candidates"
        );
        Some(opaque(&connection["pageInfo"]["endCursor"], 8192)?.to_owned())
    } else {
        None
    };
    Ok(CreateContext {
        repository_id,
        duplicate: None,
        after,
    })
}
fn output(
    session: &Session,
    code: i32,
    stdout: String,
    stderr: String,
    hint: Option<&str>,
) -> Value {
    let text = session
        .redact_output(RawOutput {
            code,
            stdout: stdout.into_bytes(),
            stderr: stderr.into_bytes(),
        })
        .text();
    json!({"code":text.code,"data":null,"stdout":text.stdout,"stderr":text.stderr,"hint":hint})
}
fn failed(session: &Session, failure: Failure, attempted: bool) -> Value {
    let code = failure.exit_code().unwrap_or(1);
    output(
        session,
        code,
        String::new(),
        if attempted {
            "GitHub pull request creation did not return a verified result.\n".into()
        } else {
            "GitHub pull request creation preflight failed.\n".into()
        },
        Some(if attempted {
            "Inspect GitHub before retrying: the pull request may have been created."
        } else if code == 4 {
            "Authentication required: run desktop-rs gh auth login in Termux, then retry."
        } else {
            "Check authentication, network access and repository permissions before retrying."
        }),
    )
}
impl Repository {
    pub(crate) async fn create_pull_request_assigned(
        &self,
        session: &Session,
        repository: &RepositoryIdentity,
        basis: &str,
        draft: Draft<'_>,
    ) -> Result<Value> {
        validate_title(draft.title)?;
        validate_text(draft.body)?;
        validate_ref(draft.base)?;
        let head = QualifiedHead::parse(draft.head)?;
        ensure!(
            head.label.contains(':') || head.branch != draft.base,
            "Head branch is the same as the base branch; cannot create a pull request"
        );
        let mut after = None;
        let mut cursors = HashSet::new();
        let mut repository_id = None;
        for page in 1..=MAX_PAGES {
            self.ensure_account_basis(basis).await?;
            let value = match session
                .pull_request_create_context(head.branch, after.as_deref())
                .await?
            {
                Ok(value) => value,
                Err(failure) => return Ok(failed(session, failure, false)),
            };
            let current = match context(&value, repository, draft.base, &head) {
                Ok(current) => current,
                Err(_) => return Ok(failed(session, Failure::InvalidResponse, false)),
            };
            if let Some(expected) = &repository_id {
                if expected != &current.repository_id {
                    return Ok(failed(session, Failure::InvalidResponse, false));
                }
            } else {
                repository_id = Some(current.repository_id.clone());
            }
            if let Some(url) = current.duplicate {
                self.ensure_account_basis(basis).await?;
                return Ok(output(
                    session,
                    1,
                    String::new(),
                    format!("A pull request for this head and base already exists:\n{url}\n"),
                    Some("Open the existing pull request instead of creating another."),
                ));
            }
            after = current.after;
            if after.is_none() {
                break;
            }
            if page == MAX_PAGES || !cursors.insert(after.clone().unwrap()) {
                return Ok(failed(session, Failure::ResponseLimit, false));
            }
        }
        // Reverify the captured numeric actor as well as the saved source and
        // assignment immediately before issuing the external mutation.
        self.ensure_account_basis(basis).await?;
        if let Err(failure) = session.get(Request::User).await? {
            return Ok(failed(session, failure, false));
        }
        self.ensure_account_basis(basis).await?;
        crate::cancellation::Cancellation::current().mark_remote_mutation();
        let result = session
            .create_pull_request(PullRequestInput {
                repository_id: repository_id
                    .as_deref()
                    .context("Missing verified GitHub repository")?,
                title: draft.title,
                body: draft.body,
                base: draft.base,
                head: &head.label,
                draft: draft.draft,
            })
            .await
            .context("Pull request creation may have completed; inspect GitHub before retrying")?;
        self.ensure_account_basis(basis).await
            .context("Repository account changed during pull request creation; inspect GitHub before retrying")?;
        let value = match result {
            Ok(value) => value,
            Err(failure) => return Ok(failed(session, failure, true)),
        };
        let created = &value["createPullRequest"]["pullRequest"];
        if opaque(&created["id"], 1024).is_err() {
            return Ok(failed(session, Failure::InvalidResponse, true));
        }
        let url = match pull_url(&created["url"], repository) {
            Ok(url) => url,
            Err(_) => return Ok(failed(session, Failure::InvalidResponse, true)),
        };
        Ok(output(session, 0, format!("{url}\n"), String::new(), None))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn repository() -> RepositoryIdentity {
        RepositoryIdentity {
            host: "github.example:8443".into(),
            owner: "owner".into(),
            name: "repository".into(),
        }
    }
    #[test]
    fn created_urls_cannot_change_origin_repository_or_introduce_credentials() {
        let repository = repository();
        assert!(
            pull_url(
                &json!("https://github.example:8443/owner/repository/pull/7"),
                &repository
            )
            .is_ok()
        );
        for url in [
            "http://github.example:8443/owner/repository/pull/7",
            "https://secret@github.example:8443/owner/repository/pull/7",
            "https://github.example:8443/owner/repository/pull/7?secret=x",
            "https://github.example:8443/owner/repository/pull/7#secret",
            "https://github.example:8443/owner/repository/pull/0",
            "https://github.example:8443/other/repository/pull/7",
            "https://github.example/owner/repository/pull/7",
            "https://evil.example/owner/repository/pull/7",
            "https://github.example:8443/owner/repository/pull/7/extra",
        ] {
            assert!(pull_url(&json!(url), &repository).is_err(), "{url}");
        }
    }
    #[test]
    fn duplicate_matching_preserves_qualified_head_and_exact_base_semantics() {
        let repository = repository();
        let mut value = json!({"repository":{"id":"R_1","nameWithOwner":"owner/repository","url":"https://github.example:8443/owner/repository","pullRequests":{"nodes":[{"url":"https://github.example:8443/owner/repository/pull/7","state":"OPEN","baseRefName":"main","headRefName":"feature","isCrossRepository":true,"headRepositoryOwner":{"login":"fork"}}],"pageInfo":{"hasNextPage":false,"endCursor":null}}}});
        assert!(
            context(
                &value,
                &repository,
                "main",
                &QualifiedHead::parse("fork:feature").unwrap()
            )
            .unwrap()
            .duplicate
            .is_some()
        );
        for (base, head) in [
            ("other", "fork:feature"),
            ("main", "feature"),
            ("main", "other:feature"),
            ("main", "Fork:feature"),
        ] {
            assert!(
                context(
                    &value,
                    &repository,
                    base,
                    &QualifiedHead::parse(head).unwrap()
                )
                .unwrap()
                .duplicate
                .is_none()
            );
        }
        value["repository"]["pullRequests"]["nodes"][0]["isCrossRepository"] = json!(false);
        assert!(
            context(
                &value,
                &repository,
                "main",
                &QualifiedHead::parse(":feature").unwrap()
            )
            .unwrap()
            .duplicate
            .is_some()
        );
        value["repository"]["pullRequests"]["pageInfo"]["hasNextPage"] = Value::Null;
        assert!(
            context(
                &value,
                &repository,
                "other",
                &QualifiedHead::parse("feature").unwrap()
            )
            .is_err()
        );
        assert!(QualifiedHead::parse("a:b:c").is_err());
    }
}
