//! Read-only preparation for publishing a local repository to GitHub.
use crate::{
    AccountTarget, PublishPreviewRequest, Repository, RepositoryIdentity, args, cancellation,
    github_api::{self, ChosenAccount, MAX_PAGES, Request, Session},
};
use anyhow::{Context, Result, ensure};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{io::Read, path::Path};

impl Repository {
    /// Discover stored accounts without requiring a pre-existing fetch remote.
    pub(crate) async fn publish_context(&self, host: &str) -> Result<Value> {
        crate::github::validate_host(host)?;
        let host = host.to_ascii_lowercase();
        let current = self.account_store_state().await?;
        let remotes = self.publish_remote_witness().await?;
        let origin_exists = remotes.0.split(|b| *b == b'\n').any(|r| r == b"origin");
        let name = self
            .path
            .file_name()
            .context("Repository has no directory name")?
            .to_string_lossy()
            .into_owned();
        let description_path = self.common_directory().await?.join("description");
        let description =
            cancellation::blocking(move || read_description(&description_path)).await?;
        let catalog = github_api::account_catalog(&self.path, &host).await?;
        self.ensure_publish_witness(&current.view.basis, &remotes)
            .await?;
        let (status, accounts, reason) = match catalog {
            Ok(accounts) => ("available", serde_json::to_value(accounts)?, None),
            Err(_) => (
                "unavailable",
                json!([]),
                Some("GitHub account catalog is unavailable"),
            ),
        };
        Ok(
            json!({"host":host,"name":name,"description":description,"private":true,
            "accounts":accounts,"assignment":current.view.assignment,"saved":current.view.saved,
            "origin_exists":origin_exists,"status":status,"reason":reason}),
        )
    }

    // Read private native remote metadata as a witness, never as response data.
    // This does not depend on the unrelated cached repository association.
    async fn publish_remote_witness(&self) -> Result<(Vec<u8>, Vec<u8>)> {
        let names = self.run(&args(&["remote"])).await?;
        let details = self.run(&args(&["remote", "-v"])).await?;
        ensure!(
            names.code == 0 && details.code == 0,
            "Cannot inspect repository remotes"
        );
        Ok((names.stdout, details.stdout))
    }
    async fn ensure_publish_witness(
        &self,
        basis: &str,
        remotes: &(Vec<u8>, Vec<u8>),
    ) -> Result<()> {
        ensure!(
            self.account_store_state().await?.view.basis == basis
                && self.publish_remote_witness().await? == *remotes,
            "Repository account or remotes changed; reload before retrying"
        );
        Ok(())
    }

    /// List organizations for a selected stored or effective account, without
    /// changing gh's active account or consulting a repository remote.
    pub(crate) async fn publish_organizations(
        &self,
        host: &str,
        target: AccountTarget,
    ) -> Result<Value> {
        let (result, _, _, _) = self.publish_organizations_session(host, target).await?;
        Ok(result)
    }

    async fn publish_organizations_session(
        &self,
        host: &str,
        target: AccountTarget,
    ) -> Result<(Value, Session, String, u64)> {
        crate::github::validate_host(host)?;
        let host = host.to_ascii_lowercase();
        let state = self.account_store_state().await?;
        let remotes = self.publish_remote_witness().await?;
        let identity = RepositoryIdentity {
            host: host.clone(),
            owner: "publish-context".into(),
            name: "publish-context".into(),
        };
        let session = match target {
            AccountTarget::Assigned {
                host: target_host,
                login,
            } => {
                ensure!(
                    target_host.eq_ignore_ascii_case(&host),
                    "Selected account host does not match"
                );
                let accounts = github_api::account_catalog(&self.path, &host)
                    .await?
                    .map_err(|_| anyhow::anyhow!("GitHub account catalog is unavailable"))?;
                let candidates: Vec<_> = accounts
                    .iter()
                    .filter(|a| a.login.eq_ignore_ascii_case(&login) && a.state == "success")
                    .collect();
                ensure!(
                    candidates.len() == 1,
                    "Selected GitHub account is unavailable"
                );
                let expected_id = match &state.view.assignment {
                    crate::AccountAssignment::Assigned {
                        host: assigned_host,
                        login: assigned_login,
                        id,
                    } if assigned_host.eq_ignore_ascii_case(&host)
                        && assigned_login.eq_ignore_ascii_case(&login) =>
                    {
                        Some(*id)
                    }
                    _ => None,
                };
                Session::open_for_account(
                    &self.path,
                    &identity,
                    Some(ChosenAccount {
                        host: &host,
                        login: &candidates[0].login,
                        id: expected_id,
                    }),
                )
                .await?
            }
            AccountTarget::Effective {} => Session::open(&self.path, &identity).await?,
            AccountTarget::None {} => {
                anyhow::bail!("Choose a GitHub account before loading organizations")
            }
        }
        .map_err(|_| anyhow::anyhow!("Selected GitHub account is unavailable"))?;
        let actor = session
            .get(Request::User)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
        let actor_id = actor["id"]
            .as_u64()
            .filter(|id| (1..=9_007_199_254_740_991).contains(id))
            .context("Invalid GitHub account")?;
        let actor_login = actor["login"]
            .as_str()
            .filter(|login| {
                !login.is_empty()
                    && login.len() <= 256
                    && login
                        .bytes()
                        .all(|b| b.is_ascii_alphanumeric() || b"-_.[]".contains(&b))
            })
            .context("Invalid GitHub account")?
            .to_owned();
        let mut organizations = Vec::new();
        let mut complete = false;
        for page in 1..=MAX_PAGES {
            self.ensure_publish_witness(&state.view.basis, &remotes)
                .await?;
            let value = session
                .get(Request::UserOrganizations { page })
                .await?
                .map_err(|_| anyhow::anyhow!("Cannot load GitHub organizations"))?;
            let rows = value
                .as_array()
                .context("Invalid GitHub organizations response")?;
            for row in rows {
                let login = row["login"]
                    .as_str()
                    .filter(|login| {
                        !login.is_empty()
                            && login.len() <= 256
                            && login
                                .bytes()
                                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
                    })
                    .context("Invalid GitHub organization")?;
                let id = row["id"]
                    .as_u64()
                    .filter(|id| (1..=9_007_199_254_740_991).contains(id))
                    .context("Invalid GitHub organization")?;
                ensure!(
                    !organizations
                        .iter()
                        .any(|(existing, existing_id): &(String, u64)| existing
                            .eq_ignore_ascii_case(login)
                            || *existing_id == id),
                    "Duplicate GitHub organization"
                );
                organizations.push((login.to_owned(), id));
            }
            if rows.len() < 100 {
                complete = true;
                break;
            }
        }
        ensure!(complete, "Too many GitHub organizations to review safely");
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        let fresh = session
            .get(Request::User)
            .await?
            .map_err(|_| anyhow::anyhow!("Cannot verify GitHub account"))?;
        ensure!(
            fresh["id"].as_u64() == Some(actor_id)
                && fresh["login"]
                    .as_str()
                    .is_some_and(|login| login.eq_ignore_ascii_case(&actor_login)),
            "GitHub account changed while loading organizations"
        );
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        organizations.sort_by_key(|(login, _)| login.to_ascii_lowercase());
        let result = json!({"organizations":organizations.into_iter().map(|(login,id)| json!({"login":login,"id":id})).collect::<Vec<_>>(),"actor":{"login":actor_login,"id":actor_id},"status":"available","reason":null});
        let encoded = serde_json::to_vec(&result)?;
        let redacted = session.redact_output_for_login(
            crate::process::RawOutput {
                code: 0,
                stdout: encoded.clone(),
                stderr: Vec::new(),
            },
            &actor_login,
        );
        ensure!(
            redacted.stdout == encoded,
            "Cannot safely display GitHub organizations"
        );
        Ok((result, session, actor_login, actor_id))
    }
}

#[derive(Clone, PartialEq, Eq, Serialize)]
struct PublishGitWitness {
    configuration: Vec<u8>,
    default_branch: Vec<u8>,
    references: Vec<u8>,
    head_ref: Vec<u8>,
    head_oid: Vec<u8>,
    head_ref_code: i32,
    head_oid_code: i32,
}

impl Repository {
    async fn publish_git_witness(&self) -> Result<PublishGitWitness> {
        // These private witnesses may contain credentials. Never return or log them.
        let configuration = self
            .run(&args(&[
                "config",
                "--null",
                "--includes",
                "--show-origin",
                "--show-scope",
                "--list",
            ]))
            .await?;
        let default_branch = self
            .run(&args(&[
                "config",
                "--global",
                "--null",
                "--get",
                "init.defaultBranch",
            ]))
            .await?;
        let references = self
            .run(&args(&[
                "for-each-ref",
                "--format=%(refname)%00%(objectname)",
                "refs/heads/",
                "refs/remotes/",
            ]))
            .await?;
        let head_ref = self
            .run(&args(&["symbolic-ref", "--quiet", "HEAD"]))
            .await?;
        let head_oid = self
            .run(&args(&["rev-parse", "--verify", "--quiet", "HEAD"]))
            .await?;
        ensure!(
            configuration.code == 0
                && matches!(default_branch.code, 0 | 1)
                && references.code == 0
                && matches!(head_ref.code, 0 | 1)
                && matches!(head_oid.code, 0 | 1),
            "Cannot inspect repository publication state"
        );
        ensure!(
            configuration.stdout.len() <= 4 * 1024 * 1024
                && references.stdout.len() <= 4 * 1024 * 1024,
            "Repository publication state is too large to review"
        );
        Ok(PublishGitWitness {
            configuration: configuration.stdout,
            default_branch: default_branch.stdout,
            references: references.stdout,
            head_ref: head_ref.stdout,
            head_oid: head_oid.stdout,
            head_ref_code: head_ref.code,
            head_oid_code: head_oid.code,
        })
    }

    pub(crate) async fn publish_preview(&self, request: &PublishPreviewRequest) -> Result<Value> {
        crate::github::validate_host(&request.host)?;
        crate::github::validate_repository(&format!("{}/{}", request.owner, request.name))?;
        ensure!(
            request.name.len() <= 100 && request.owner.len() <= 256,
            "Invalid repository name or owner"
        );
        crate::github::validate_text(&request.description)?;
        let state = self.account_store_state().await?;
        ensure!(state.view.saved, "Save the repository before publishing");
        let remotes = self.publish_remote_witness().await?;
        ensure!(
            !remotes.0.split(|b| *b == b'\n').any(|r| r == b"origin"),
            "An origin remote already exists"
        );
        let git = self.publish_git_witness().await?;
        let has_remotes = !remotes.0.is_empty();
        let default_branch = if has_remotes {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine the default branch"))?
                    .default_branch,
            )?)
        } else {
            None
        };
        let (organizations, session, actor_login, actor_id) = self
            .publish_organizations_session(&request.host, request.target.clone())
            .await?;
        let (owner_login, owner_id, owner_kind) =
            if request.owner.eq_ignore_ascii_case(&actor_login) {
                (actor_login.clone(), actor_id, "personal")
            } else {
                let rows = organizations["organizations"]
                    .as_array()
                    .context("Invalid organization catalog")?;
                let row = rows
                    .iter()
                    .find(|row| {
                        row["login"]
                            .as_str()
                            .is_some_and(|login| login.eq_ignore_ascii_case(&request.owner))
                    })
                    .context("Selected organization is unavailable")?;
                (
                    row["login"]
                        .as_str()
                        .context("Invalid organization")?
                        .to_owned(),
                    row["id"].as_u64().context("Invalid organization")?,
                    "organization",
                )
            };
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == git,
            "Repository publication state changed; reload before retrying"
        );
        let fresh_default_branch = if has_remotes {
            Some(serde_json::to_value(
                self.branch_policy()
                    .await
                    .map_err(|_| anyhow::anyhow!("Cannot determine the default branch"))?
                    .default_branch,
            )?)
        } else {
            None
        };
        ensure!(
            fresh_default_branch == default_branch,
            "Default branch changed; reload before retrying"
        );
        self.ensure_publish_witness(&state.view.basis, &remotes)
            .await?;
        ensure!(
            self.publish_git_witness().await? == git,
            "Repository publication state changed; reload before retrying"
        );
        let (push_status, pushes) = publish_push_plan(&git, default_branch.as_ref())?;
        let basis = format!(
            "{:x}",
            Sha256::digest(serde_json::to_vec(&(
                request,
                &state.view.basis,
                &remotes,
                &git,
                &default_branch,
                &actor_login,
                actor_id,
                &owner_login,
                owner_id,
                owner_kind,
            ))?)
        );
        let result = json!({"basis":basis,"can_apply":false,"reason":"Publishing is not implemented yet",
            "actor":{"login":actor_login,"id":actor_id},
            "owner":{"login":owner_login,"id":owner_id,"kind":owner_kind},
            "pushes":pushes,"push_status":push_status});
        let encoded = serde_json::to_vec(&result)?;
        let redacted = session.redact_output_for_login(
            crate::process::RawOutput {
                code: 0,
                stdout: encoded.clone(),
                stderr: Vec::new(),
            },
            &actor_login,
        );
        ensure!(
            redacted.stdout == encoded,
            "Cannot safely display publication review"
        );
        Ok(result)
    }
}

fn publish_push_plan(
    git: &PublishGitWitness,
    selected_default: Option<&Value>,
) -> Result<(&'static str, Vec<Value>)> {
    if git.head_oid_code != 0 {
        return Ok(("unborn", Vec::new()));
    }
    if git.head_ref_code != 0 {
        return Ok(("detached", Vec::new()));
    }
    let head = std::str::from_utf8(&git.head_ref)?
        .strip_suffix('\n')
        .context("Invalid HEAD reference")?;
    let branch = head
        .strip_prefix("refs/heads/")
        .context("HEAD does not reference a local branch")?;
    let oid = std::str::from_utf8(&git.head_oid)?
        .strip_suffix('\n')
        .context("Invalid HEAD object")?;
    ensure!(
        !oid.is_empty() && oid.bytes().all(|b| b.is_ascii_hexdigit()),
        "Invalid HEAD object"
    );
    let default_name = if git.default_branch.is_empty() {
        "main"
    } else {
        std::str::from_utf8(
            git.default_branch
                .strip_suffix(&[0])
                .context("Invalid default branch")?,
        )?
    };
    let fallback_ref = format!("refs/heads/{default_name}");
    let chosen = match selected_default {
        None => Some((default_name, fallback_ref.as_str())),
        Some(Value::Null) => None,
        Some(value) => Some((
            value["name"].as_str().context("Invalid default branch")?,
            value["reference"]
                .as_str()
                .context("Invalid default branch")?,
        )),
    };
    let mut pushes = Vec::new();
    for row in git
        .references
        .split(|b| *b == b'\n')
        .filter(|row| !row.is_empty())
    {
        let separator = row
            .iter()
            .position(|b| *b == 0)
            .context("Invalid local branch data")?;
        let reference = &row[..separator];
        let value = &row[separator + 1..];
        if let Some((default_name, default_ref)) = chosen
            && reference == default_ref.as_bytes()
            && default_name != branch
        {
            let value = std::str::from_utf8(value)?;
            ensure!(
                !value.is_empty() && value.bytes().all(|b| b.is_ascii_hexdigit()),
                "Invalid branch object"
            );
            pushes.push(json!({"branch":default_name,"oid":value,"role":"default"}));
        }
    }
    pushes.push(json!({"branch":branch,"oid":oid,"role":"current"}));
    Ok(("planned", pushes))
}

fn read_description(path: &Path) -> Result<String> {
    let Some(parent) = path.parent() else {
        return Ok(String::new());
    };
    let directory = match Dir::open_ambient_dir(parent, ambient_authority()) {
        Ok(dir) => dir,
        Err(_) => return Ok(String::new()),
    };
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = match directory.open_with("description", &options) {
        Ok(file) if file.metadata()?.is_file() => file,
        _ => return Ok(String::new()),
    };
    let mut bytes = Vec::new();
    file.by_ref().take(65537).read_to_end(&mut bytes)?;
    ensure!(
        bytes.len() <= 65536,
        "Repository description exceeds 64 KiB"
    );
    let value = String::from_utf8_lossy(&bytes).into_owned();
    Ok(
        if value == "Unnamed repository; edit this file 'description' to name the repository.\n" {
            String::new()
        } else {
            value
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn push_review_preserves_default_order_and_skips_unborn_or_detached() {
        let mut git = PublishGitWitness {
            configuration: Vec::new(),
            default_branch: b"main\0".to_vec(),
            references: b"refs/heads/main\0abcd\nrefs/heads/topic\0beef\n".to_vec(),
            head_ref: b"refs/heads/topic\n".to_vec(),
            head_oid: b"beef\n".to_vec(),
            head_ref_code: 0,
            head_oid_code: 0,
        };
        let (status, pushes) = publish_push_plan(&git, None).unwrap();
        assert_eq!(status, "planned");
        assert_eq!(
            pushes,
            vec![
                json!({"branch":"main","oid":"abcd","role":"default"}),
                json!({"branch":"topic","oid":"beef","role":"current"})
            ]
        );
        let chosen = json!({"name":"tracked","reference":"refs/heads/tracked","local":true});
        git.references
            .extend_from_slice(b"refs/heads/tracked\0cafe\n");
        let selected = publish_push_plan(&git, Some(&chosen)).unwrap().1;
        assert_eq!(
            selected[0],
            json!({"branch":"tracked","oid":"cafe","role":"default"})
        );
        let no_default = publish_push_plan(&git, Some(&Value::Null)).unwrap().1;
        assert_eq!(no_default.len(), 1);
        git.head_ref = b"refs/heads/main\n".to_vec();
        git.head_oid = b"abcd\n".to_vec();
        assert_eq!(publish_push_plan(&git, None).unwrap().1.len(), 1);
        git.head_ref_code = 1;
        assert_eq!(publish_push_plan(&git, None).unwrap(), ("detached", vec![]));
        git.head_oid_code = 1;
        assert_eq!(publish_push_plan(&git, None).unwrap(), ("unborn", vec![]));
    }

    #[test]
    fn descriptions_preserve_user_text_and_never_follow_links_or_wait_for_fifos() {
        let root = std::env::temp_dir().join(format!(
            "desktop-publish-description-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir(&root).unwrap();
        let description = root.join("description");
        std::fs::write(&description, "  custom description  \n\n").unwrap();
        assert_eq!(
            read_description(&description).unwrap(),
            "  custom description  \n\n"
        );
        std::fs::write(
            &description,
            "Unnamed repository; edit this file 'description' to name the repository.\n",
        )
        .unwrap();
        assert_eq!(read_description(&description).unwrap(), "");
        #[cfg(unix)]
        {
            use std::{ffi::CString, os::unix::fs::symlink};
            std::fs::remove_file(&description).unwrap();
            let outside = root.join("private");
            std::fs::write(&outside, "PRIVATE-MARKER").unwrap();
            symlink(&outside, &description).unwrap();
            assert_eq!(read_description(&description).unwrap(), "");
            std::fs::remove_file(&description).unwrap();
            let name = CString::new(description.as_os_str().as_encoded_bytes()).unwrap();
            assert_eq!(unsafe { libc::mkfifo(name.as_ptr(), 0o600) }, 0);
            assert_eq!(read_description(&description).unwrap(), "");
        }
        std::fs::remove_dir_all(root).unwrap();
    }
}
