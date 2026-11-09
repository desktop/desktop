//! Credential-free canonical identity from an effective native Git fetch URL.
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Identity {
    pub host: String,
    pub owner: String,
    pub name: String,
}

impl Identity {
    /// Parse a GitHub-shaped remote without copying transport secrets into identity.
    pub(crate) fn from_url(value: &str) -> Result<Self> {
        anyhow::ensure!(
            !value.is_empty()
                && value.len() <= 16 * 1024
                && !value
                    .chars()
                    .any(|character| character.is_control() || character.is_whitespace())
                && !value.contains('\\'),
            "Invalid repository remote URL"
        );
        let (host, path) = if let Some((scheme, remainder)) = value.split_once("://") {
            let scheme = scheme.to_ascii_lowercase();
            anyhow::ensure!(
                matches!(scheme.as_str(), "https" | "http" | "ssh" | "git"),
                "Unsupported repository remote URL scheme"
            );
            let remainder = if matches!(scheme.as_str(), "https" | "http") {
                // HTTP query parameters and fragments are not repository identity.
                // This also keeps URL credentials and token-bearing query strings
                // out of cached/public metadata and subsequent gh arguments.
                remainder.split(['?', '#']).next().unwrap_or_default()
            } else {
                anyhow::ensure!(
                    !remainder.contains(['?', '#']),
                    "Ambiguous repository transport path"
                );
                remainder
            };
            let (authority, path) = remainder
                .split_once('/')
                .context("Missing repository URL path")?;
            let authority = strip_userinfo(authority)?;
            let host_use = match scheme.as_str() {
                "http" => HostUse::Web(80),
                "https" => HostUse::Web(443),
                _ => HostUse::Transport,
            };
            (canonical_host(authority, host_use)?, path)
        } else {
            // Native Git's scp-like syntax is [user@]host:owner/repository.
            // Paths, Git's file:// protocol, and host/owner shortcuts are not
            // evidence of a network GitHub repository.
            anyhow::ensure!(
                !value.contains(['?', '#']),
                "Ambiguous repository transport path"
            );
            let (authority, path) = value
                .split_once(':')
                .context("Missing repository remote host")?;
            anyhow::ensure!(
                !authority.contains('/') && !path.starts_with('/'),
                "Invalid scp-style repository URL"
            );
            (
                canonical_host(strip_userinfo(authority)?, HostUse::Transport)?,
                path,
            )
        };
        // One conventional trailing slash is allowed, but empty components,
        // extra segments and encoded path separators never get collapsed.
        let path = path.strip_suffix('/').unwrap_or(path);
        let (owner, name) = path
            .split_once('/')
            .context("Missing repository owner/name")?;
        anyhow::ensure!(
            !name.contains('/'),
            "Repository URL must contain exactly owner/name"
        );
        let owner = decode_component(owner)?.to_ascii_lowercase();
        let name = decode_component(name)?.to_ascii_lowercase();
        let name = name.strip_suffix(".git").unwrap_or(&name).to_owned();
        let identity = Self { host, owner, name };
        identity.validate()?;
        Ok(identity)
    }

    /// Identifier accepted as the explicit repository argument to `gh repo view`.
    pub(crate) fn selector(&self) -> String {
        format!("{}/{}/{}", self.host, self.owner, self.name)
    }

    /// Validate cached/deserialized values as canonical repository identities.
    pub(crate) fn validate(&self) -> Result<()> {
        let selector = self.selector();
        anyhow::ensure!(
            selector.len() <= 16 * 1024,
            "Repository identity exceeds supported size"
        );
        crate::github::validate_repository(&selector)?;
        anyhow::ensure!(
            self.host == canonical_host(&self.host, HostUse::StoredIdentity)?
                && self.owner == self.owner.to_ascii_lowercase()
                && self.name == self.name.to_ascii_lowercase(),
            "Repository identity is not canonical"
        );
        Ok(())
    }
}

fn strip_userinfo(authority: &str) -> Result<&str> {
    match authority.rsplit_once('@') {
        Some((userinfo, host)) => {
            anyhow::ensure!(
                !userinfo.is_empty() && !userinfo.contains('@'),
                "Invalid repository URL authority"
            );
            Ok(host)
        }
        None => Ok(authority),
    }
}

enum HostUse {
    Web(u16),
    Transport,
    StoredIdentity,
}

fn canonical_host(authority: &str, host_use: HostUse) -> Result<String> {
    let (hostname, port) = authority
        .split_once(':')
        .map_or((authority, None), |(host, port)| (host, Some(port)));
    let hostname = hostname
        .strip_suffix('.')
        .unwrap_or(hostname)
        .to_ascii_lowercase();
    anyhow::ensure!(
        !hostname.is_empty()
            && hostname
                .split('.')
                .all(|label| !label.is_empty() && !label.starts_with('-') && !label.ends_with('-')),
        "Invalid repository hostname"
    );
    let port = port
        .map(|port| -> Result<u16> {
            anyhow::ensure!(
                !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit()),
                "Invalid repository port"
            );
            let port: u16 = port.parse().context("Invalid repository port")?;
            anyhow::ensure!(port != 0, "Invalid repository port");
            Ok(port)
        })
        .transpose()?;
    // SSH/Git ports describe transport, not the GitHub web/API endpoint. The
    // same rule is used by Desktop's getRemoteWebHost helper.
    let host = match (host_use, port) {
        (HostUse::Web(default), Some(port)) if port == default => hostname,
        (HostUse::Web(_) | HostUse::StoredIdentity, Some(port)) => format!("{hostname}:{port}"),
        _ => hostname,
    };
    crate::github::validate_host(&host)?;
    Ok(host)
}

fn decode_component(value: &str) -> Result<String> {
    let mut decoded = Vec::with_capacity(value.len());
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let high = bytes
                .next()
                .and_then(hex_digit)
                .context("Invalid repository path encoding")?;
            let low = bytes
                .next()
                .and_then(hex_digit)
                .context("Invalid repository path encoding")?;
            decoded.push(high * 16 + low);
        } else {
            decoded.push(byte);
        }
    }
    String::from_utf8(decoded).context("Invalid repository path encoding")
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dotcom() -> Identity {
        Identity {
            host: "github.com".into(),
            owner: "owner".into(),
            name: "repo".into(),
        }
    }

    #[test]
    fn standard_transports_share_a_canonical_identity() {
        for remote in [
            "https://GitHub.COM/Owner/Repo.git",
            "HTTPS://github.com.:443/OWNER/REPO.GIT/",
            "http://github.com:80/owner/repo",
            "git@github.com:Owner/Repo.git",
            "github.com:owner/repo",
            "ssh://git@github.com/Owner/Repo.git",
            "ssh://git@github.com:2222/owner/repo.git",
            "git://github.com:9418/owner/repo.git",
            "https://github.com/%4fwner/%52epo%2egit",
        ] {
            assert_eq!(Identity::from_url(remote).unwrap(), dotcom());
        }
        assert_eq!(dotcom().selector(), "github.com/owner/repo");
    }

    #[test]
    fn accepts_leading_hyphens_in_repository_names() {
        for remote in [
            "https://github.com/owner/-repo.git",
            "https://github.com/owner/%2drepo.git",
            "git@github.com:owner/-repo.git",
        ] {
            let identity = Identity::from_url(remote).unwrap();
            assert_eq!(identity.name, "-repo");
            assert_eq!(identity.selector(), "github.com/owner/-repo");
        }
        assert!(Identity::from_url("https://github.com/-owner/repo.git").is_err());
    }

    #[test]
    fn credentials_and_url_parameters_are_not_identity_or_selector() {
        let identity = Identity::from_url("https://private:password%40secret@GitHub.COM/Owner/Repo.git?token=secret#private-fragment").unwrap();
        assert_eq!(identity, dotcom());
        let json = serde_json::to_string(&identity).unwrap();
        assert_eq!(
            json,
            r#"{"host":"github.com","owner":"owner","name":"repo"}"#
        );
        assert!(!identity.selector().contains("secret"));
        assert_eq!(
            Identity::from_url("ssh://private-user@github.com/owner/repo").unwrap(),
            dotcom()
        );
    }

    #[test]
    fn web_ports_are_preserved_and_transport_ports_are_not_web_ports() {
        for remote in [
            "https://Enterprise.EXAMPLE:08443/Owner/Repo.git",
            "http://enterprise.example:8443/owner/repo",
        ] {
            let identity = Identity::from_url(remote).unwrap();
            assert_eq!(identity.host, "enterprise.example:8443");
            assert_eq!(identity.selector(), "enterprise.example:8443/owner/repo");
        }
        assert_eq!(
            Identity::from_url("https://localhost:19876/owner/repo")
                .unwrap()
                .host,
            "localhost:19876"
        );
        assert_eq!(
            Identity::from_url("http://enterprise.example:443/owner/repo")
                .unwrap()
                .host,
            "enterprise.example:443"
        );
        assert_eq!(
            Identity::from_url("ssh://git@enterprise.example:8443/owner/repo")
                .unwrap()
                .host,
            "enterprise.example"
        );
    }

    #[test]
    fn ambiguous_paths_authorities_and_local_paths_are_rejected_without_secrets() {
        for remote in [
            "",
            "owner/repo",
            "/owner/repo",
            "../owner/repo",
            "file:///owner/repo",
            "ext::private-command",
            "https://github.com/owner/repo/extra",
            "https://github.com//owner/repo",
            "https://github.com/owner/repo//",
            "https://github.com/owner/..",
            "https://github.com/../repo",
            "https://github.com/owner/%2e%2e",
            "https://github.com/owner/%2frepo",
            "https://github.com/owner/re%5cpo",
            "https://github.com/owner/re%00po",
            "https://github.com/owner/%252frepo",
            "https://github.com/owner/%zz",
            "https://github.com/owner/%",
            "https://github.com/owner/repo.git/.git",
            "https://github.com/owner/.git",
            "https://github.com:/owner/repo",
            "https://github.com:0/owner/repo",
            "https://github.com:65536/owner/repo",
            "https://github.com:443:80/owner/repo",
            "https://.github.com/owner/repo",
            "https://github..com/owner/repo",
            "https://-github.com/owner/repo",
            "https://github.com-/owner/repo",
            "https://github.com\\evil/owner/repo",
            "https://@github.com/owner/repo",
            "https://private@secret@github.com/owner/repo",
            "https://github.com/owner/repo\nsecret",
            "ssh://git@github.com/owner/repo?secret",
            "git@github.com:owner/repo#secret",
            "git@github.com:/owner/repo",
            "C:/owner/repo",
            "C:\\owner\\repo",
            "https://github.com/owner/repo name",
            "https://github.com/owner/répo",
        ] {
            assert!(
                Identity::from_url(remote).is_err(),
                "accepted an invalid repository URL"
            );
            let error = Identity::from_url(remote).unwrap_err().to_string();
            assert!(!error.contains("secret"));
            assert!(!error.contains("private"));
        }
    }

    #[test]
    fn deserialized_identity_must_be_canonical_and_unknown_fields_are_refused() {
        let mut identity = dotcom();
        identity.owner = "OWNER".into();
        assert!(identity.validate().is_err());
        identity = dotcom();
        identity.host = "github.com:0443".into();
        assert!(identity.validate().is_err());
        identity = dotcom();
        identity.name = "../repo".into();
        assert!(identity.validate().is_err());
        identity = dotcom();
        identity.name = "a".repeat(16 * 1024);
        assert!(identity.validate().is_err());
        assert!(
            serde_json::from_str::<Identity>(
                r#"{"host":"github.com","owner":"owner","name":"repo","token":"secret"}"#
            )
            .is_err()
        );
    }
}
