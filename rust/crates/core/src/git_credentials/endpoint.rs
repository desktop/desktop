//! Exact HTTPS credential routing, distinct from transport-neutral API identity.
//!
//! Operation URLs are validated before native Git can normalize them. Native
//! credential contexts already contain decoded host/path values and must never
//! be percent-decoded again. Git's credential.c and Git LFS's creds/creds.go
//! define these boundaries; only the conventional /info/lfs suffix is admitted.
use super::protocol::CredentialContext;
use crate::RepositoryIdentity;
use anyhow::{Context, Result, anyhow, ensure};

const MAX_URL_BYTES: usize = 16 * 1024;
const MAX_COMPONENT_BYTES: usize = 4096;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Origin {
    pub(crate) host: String,
    pub(crate) port: u16,
}

impl Origin {
    fn from_authority(authority: &str) -> Result<Self> {
        ensure!(
            !authority.is_empty()
                && !authority.contains(['@', '/', '\\', '?', '#', '%'])
                && !authority
                    .chars()
                    .any(|c| c.is_control() || c.is_whitespace()),
            "Invalid HTTPS credential origin"
        );
        let (host, port) = match authority.split_once(':') {
            Some((host, port)) => {
                ensure!(
                    !port.is_empty() && port.bytes().all(|byte| byte.is_ascii_digit()),
                    "Invalid HTTPS credential port"
                );
                let port: u16 = port
                    .parse()
                    .map_err(|_| anyhow!("Invalid HTTPS credential port"))?;
                ensure!(port != 0, "Invalid HTTPS credential port");
                (host, port)
            }
            None => (authority, 443),
        };
        // Restrict to the DNS/IPv4 vocabulary accepted by saved GitHub accounts.
        // A terminal DNS dot is retained rather than conflating distinct origins.
        ensure!(
            host.len() <= 254
                && !host.is_empty()
                && host
                    .strip_suffix('.')
                    .unwrap_or(host)
                    .split('.')
                    .all(|label| !label.is_empty()
                        && label.len() <= 63
                        && !label.starts_with('-')
                        && !label.ends_with('-')
                        && label
                            .bytes()
                            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')),
            "Invalid HTTPS credential hostname"
        );
        Ok(Self {
            host: host.to_ascii_lowercase(),
            port,
        })
    }

    /// Canonical HTTPS authority; only HTTPS's default port is omitted.
    pub(crate) fn authority(&self) -> String {
        if self.port == 443 {
            self.host.clone()
        } else {
            format!("{}:{}", self.host, self.port)
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum EndpointKind {
    Git,
    Lfs,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct Endpoint {
    pub(crate) origin: Origin,
    pub(crate) owner: String,
    pub(crate) name: String,
    pub(crate) kind: EndpointKind,
}

impl Endpoint {
    /// Parse only a complete, credential-free HTTPS operation URL. Arbitrary
    /// LFS URLs, queries, fragments and userinfo require separate explicit
    /// transport policy and cannot receive an assigned GitHub account token.
    pub(crate) fn from_operation_url(value: &str) -> Result<Self> {
        ensure!(
            !value.is_empty()
                && value.len() <= MAX_URL_BYTES
                && !value.contains(['\\', '?', '#'])
                && !value.chars().any(|c| c.is_control() || c.is_whitespace()),
            "Invalid HTTPS credential URL"
        );
        let (scheme, remainder) = value
            .split_once("://")
            .context("HTTPS credentials require an explicit HTTPS URL")?;
        ensure!(
            scheme.eq_ignore_ascii_case("https"),
            "Assigned credentials require HTTPS"
        );
        let (authority, path) = remainder
            .split_once('/')
            .context("HTTPS credentials require a repository path")?;
        let origin = Origin::from_authority(authority)?;
        let decoded = decode_operation_path(path)?;
        Self::from_decoded_path(origin, &decoded)
    }

    /// Git URL-decodes host/path before invoking helpers; LFS likewise supplies
    /// Go URL.Path. Decoding again could turn a double-encoded separator into
    /// another repository. Helper field values are always consumed literally.
    pub(crate) fn from_credential(context: &CredentialContext) -> Result<Self> {
        ensure!(
            context
                .protocol()
                .is_some_and(|scheme| scheme.eq_ignore_ascii_case("https")),
            "Assigned credentials require HTTPS"
        );
        let origin =
            Origin::from_authority(context.host().context("Credential origin is missing")?)?;
        let path = context
            .path()
            .context("Credential repository path is missing; enable credential.useHttpPath")?;
        Self::from_decoded_path(origin, path)
    }

    fn from_decoded_path(origin: Origin, path: &str) -> Result<Self> {
        ensure!(
            !path.is_empty()
                && path.len() <= MAX_URL_BYTES
                && !path.contains(['%', '\\', '?', '#'])
                && !path.chars().any(|c| c.is_control() || c.is_whitespace()),
            "Invalid HTTPS credential repository path"
        );
        // One conventional trailing slash is harmless, but never collapse
        // repeated slashes or a leading slash in native helper fields.
        let path = path.strip_suffix('/').unwrap_or(path);
        let components = path.split('/').collect::<Vec<_>>();
        let (owner, name, kind) = match components.as_slice() {
            [owner, name] => (*owner, *name, EndpointKind::Git),
            [owner, name, "info", "lfs"] => (*owner, *name, EndpointKind::Lfs),
            _ => return Err(anyhow!("Unsupported HTTPS credential repository path")),
        };
        let owner = owner.to_ascii_lowercase();
        let name = name.to_ascii_lowercase();
        let name = name.strip_suffix(".git").unwrap_or(&name).to_owned();
        ensure!(
            !owner.starts_with('-'),
            "Invalid HTTPS credential repository owner"
        );
        for component in [&owner, &name] {
            ensure!(
                !component.is_empty()
                    && component.len() <= MAX_COMPONENT_BYTES
                    && !matches!(component.as_str(), "." | "..")
                    && component
                        .bytes()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"._-".contains(&byte)),
                "Invalid HTTPS credential repository component"
            );
        }
        Ok(Self {
            origin,
            owner,
            name,
            kind,
        })
    }

    /// Allow the conventional LFS endpoint without widening origin/path scope.
    pub(crate) fn same_repository(&self, other: &Self) -> bool {
        self.origin == other.origin && self.owner == other.owner && self.name == other.name
    }

    pub(crate) fn identity(&self) -> RepositoryIdentity {
        RepositoryIdentity {
            host: self.origin.authority(),
            owner: self.owner.clone(),
            name: self.name.clone(),
        }
    }
}

fn decode_operation_path(path: &str) -> Result<String> {
    let mut decoded = Vec::with_capacity(path.len());
    let mut bytes = path.bytes();
    while let Some(byte) = bytes.next() {
        let byte = if byte == b'%' {
            let high = bytes
                .next()
                .and_then(hex_digit)
                .context("Invalid HTTPS credential path encoding")?;
            let low = bytes
                .next()
                .and_then(hex_digit)
                .context("Invalid HTTPS credential path encoding")?;
            let byte = high * 16 + low;
            ensure!(
                !matches!(byte, b'/' | b'\\' | b'%'),
                "Encoded separators are not allowed in HTTPS credential paths"
            );
            byte
        } else {
            byte
        };
        decoded.push(byte);
    }
    String::from_utf8(decoded).map_err(|_| anyhow!("Invalid HTTPS credential path encoding"))
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

    fn endpoint(value: &str) -> Endpoint {
        Endpoint::from_operation_url(value).unwrap()
    }

    #[test]
    fn default_ports_names_and_conventional_lfs_paths_share_only_the_repository() {
        let expected = endpoint("https://github.com/owner/repo");
        for url in [
            "HTTPS://GitHub.COM:0443/Owner/Repo.git/",
            "https://github.com/%4fwner/%52epo%2egit",
            "https://github.com/owner/repo.git/info/lfs",
            "https://github.com/owner/repo/info/lfs/",
        ] {
            assert!(expected.same_repository(&endpoint(url)), "{url}");
        }
        assert_eq!(expected.kind, EndpointKind::Git);
        assert_eq!(
            endpoint("https://github.com/owner/repo.git/info/lfs").kind,
            EndpointKind::Lfs
        );
        assert_eq!(expected.identity().host, "github.com");
        assert_eq!(
            endpoint("https://Enterprise.Example:08443/owner/repo")
                .identity()
                .host,
            "enterprise.example:8443"
        );
    }

    #[test]
    fn leading_hyphen_repository_names_keep_exact_credential_scope() {
        let expected = endpoint("https://github.com/owner/-repo.git");
        assert_eq!(expected.identity().name, "-repo");
        let context = CredentialContext::parse(
            b"protocol=https\nhost=github.com\npath=owner/-repo.git/info/lfs\n\n",
        )
        .unwrap();
        assert!(expected.same_repository(&Endpoint::from_credential(&context).unwrap()));
        assert!(!expected.same_repository(&endpoint("https://github.com/owner/-repo-other.git")));
        assert!(Endpoint::from_operation_url("https://github.com/-owner/repo").is_err());
    }

    #[test]
    fn same_host_prefixes_other_repositories_ports_and_origins_are_not_equivalent() {
        let expected = endpoint("https://github.com/owner/repo");
        for url in [
            "https://github.com/owner/repo-other",
            "https://github.com/owner-other/repo",
            "https://github.com/other/repo",
            "https://github.com:8443/owner/repo",
            "https://github.com./owner/repo",
            "https://other.github.com/owner/repo",
            "https://api.github.com/owner/repo",
        ] {
            assert!(!expected.same_repository(&endpoint(url)), "{url}");
        }
    }

    #[test]
    fn native_credential_fields_are_already_decoded_and_never_decoded_again() {
        let context = CredentialContext::parse(
            b"protocol=https\nhost=GitHub.COM:443\npath=Owner/Repo.git/info/lfs\n\n",
        )
        .unwrap();
        assert!(
            endpoint("https://github.com/owner/repo")
                .same_repository(&Endpoint::from_credential(&context).unwrap())
        );
        for path in [
            "owner/%52epo.git",
            "owner/repo%2fother",
            "owner/repo%252fother",
            "owner/repo.git/info/lfs-evil",
            "/owner/repo",
            "owner/repo//",
            "owner/../repo",
        ] {
            let input = format!("protocol=https\nhost=github.com\npath={path}\n");
            assert!(
                Endpoint::from_credential(&CredentialContext::parse(input.as_bytes()).unwrap())
                    .is_err(),
                "{path}"
            );
        }
        for input in [
            b"protocol=https\nhost=github.com\n".as_slice(),
            b"protocol=http\nhost=github.com\npath=owner/repo\n",
            b"protocol=https\nhost=github.com:80\npath=owner/repo\n",
        ] {
            let context = CredentialContext::parse(input).unwrap();
            if let Ok(actual) = Endpoint::from_credential(&context) {
                assert!(!endpoint("https://github.com/owner/repo").same_repository(&actual));
            }
        }
    }

    #[test]
    fn operation_urls_fail_before_git_can_normalize_ambiguous_or_secret_parts() {
        for url in [
            "http://github.com/owner/repo",
            "ssh://git@github.com:443/owner/repo",
            "https://private@github.com/owner/repo",
            "https://User:private@github.com/owner/repo",
            "https://github.com/owner/repo?private=value",
            "https://github.com/owner/repo#private",
            "https://github.com",
            "https://github.com/",
            "https://github.com:0/owner/repo",
            "https://github.com:65536/owner/repo",
            "https://github.com:443:80/owner/repo",
            "https://github..com/owner/repo",
            "https://-github.com/owner/repo",
            "https://github.com-/owner/repo",
            "https://%67ithub.com/owner/repo",
            "https://github.com/owner/repo.git/extra",
            "https://github.com/owner/repo.git/info/lfs/objects",
            "https://github.com/owner/repo.git/info/lfs-evil",
            "https://github.com//owner/repo",
            "https://github.com/owner//repo",
            "https://github.com/owner/../repo",
            "https://github.com/owner/%2e%2e",
            "https://github.com/owner/repo%2fprivate",
            "https://github.com/owner/repo%5cprivate",
            "https://github.com/owner/repo%252fprivate",
            "https://github.com/owner/repo%00private",
            "https://github.com/owner/repo%0aprivate",
            "https://github.com/owner/repo%3fprivate",
            "https://github.com/owner/repo%",
            "https://github.com/owner/repo%zz",
            "https://github.com/owner/.git",
        ] {
            let error = Endpoint::from_operation_url(url).unwrap_err();
            assert!(!error.to_string().contains("private"), "{url}");
        }
    }
}
