//! Read-only preparation for publishing a local repository to GitHub.
use crate::{
    AccountTarget, Repository, RepositoryIdentity, args, cancellation,
    github_api::{self, ChosenAccount, MAX_PAGES, Request, Session},
};
use anyhow::{Context, Result, ensure};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde_json::{Value, json};
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
            .filter(|id| *id > 0)
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
                    .filter(|id| *id > 0)
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
        let result = json!({"organizations":organizations.into_iter().map(|(login,id)| json!({"login":login,"id":id})).collect::<Vec<_>>(),"status":"available","reason":null});
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
        Ok(result)
    }
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
