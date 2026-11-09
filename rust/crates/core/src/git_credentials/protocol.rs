//! Bounded Git credential-helper input and deliberately minimal output.
//!
//! Protocol values are not URL encoded. Input has no Debug/serialization
//! implementation, and errors never include input or credential values.
use anyhow::{Result, anyhow, ensure};
use std::collections::BTreeSet;

pub(crate) const MAX_INPUT_BYTES: usize = 64 * 1024;
const MAX_LINE_BYTES: usize = 65_535;
const MAX_FIELDS: usize = 128;
const MAX_KEY_BYTES: usize = 128;

#[derive(Clone, Copy, Eq, PartialEq)]
pub(crate) enum Operation {
    Get,
    Store,
    Erase,
}

impl Operation {
    pub(crate) fn parse(value: &str) -> Result<Self> {
        match value {
            "get" => Ok(Self::Get),
            "store" => Ok(Self::Store),
            "erase" => Ok(Self::Erase),
            _ => Err(anyhow!("Unsupported credential-helper operation")),
        }
    }
}

/// Only routing fields survive parsing; supplied passwords and refresh tokens
/// are consumed without being copied into the context.
pub(crate) struct CredentialContext {
    protocol: Option<String>,
    host: Option<String>,
    path: Option<String>,
    username: Option<String>,
}

impl CredentialContext {
    pub(crate) fn parse(input: &[u8]) -> Result<Self> {
        ensure!(
            input.len() <= MAX_INPUT_BYTES,
            "Credential-helper input exceeds the supported size"
        );
        ensure!(!input.contains(&0), "Invalid credential-helper input");
        let mut context = Self {
            protocol: None,
            host: None,
            path: None,
            username: None,
        };
        let mut fields = 0;
        let mut singletons = BTreeSet::new();
        let mut ended = false;
        for segment in input.split_inclusive(|byte| *byte == b'\n') {
            ensure!(
                segment.len() <= MAX_LINE_BYTES,
                "Credential-helper line exceeds the supported size"
            );
            let line = match segment.strip_suffix(b"\n") {
                Some(line) => line.strip_suffix(b"\r").unwrap_or(line),
                None => segment,
            };
            ensure!(!line.contains(&b'\r'), "Invalid credential-helper input");
            if line.is_empty() {
                ended = true;
                continue;
            }
            ensure!(!ended, "Unexpected data after credential-helper input");
            fields += 1;
            ensure!(
                fields <= MAX_FIELDS,
                "Credential-helper input contains too many fields"
            );
            let at = line
                .iter()
                .position(|byte| *byte == b'=')
                .ok_or_else(|| anyhow!("Invalid credential-helper field"))?;
            let key = &line[..at];
            let value = &line[at + 1..];
            let base = key.strip_suffix(b"[]").unwrap_or(key);
            ensure!(
                !base.is_empty()
                    && key.len() <= MAX_KEY_BYTES
                    && base
                        .iter()
                        .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(byte)),
                "Invalid credential-helper field"
            );
            if key == base {
                ensure!(singletons.insert(key), "Duplicate credential-helper field");
            }
            // Native Git expands URL input before writing helper fields. A URL
            // here would introduce order-dependent field-reset semantics.
            ensure!(key != b"url", "Credential-helper URLs must be expanded");
            let destination = match key {
                b"protocol" => Some(&mut context.protocol),
                b"host" => Some(&mut context.host),
                b"path" => Some(&mut context.path),
                b"username" => Some(&mut context.username),
                _ => None,
            };
            if let Some(destination) = destination {
                let value = std::str::from_utf8(value)
                    .map_err(|_| anyhow!("Invalid credential-helper routing field"))?;
                ensure!(
                    !value.chars().any(char::is_control),
                    "Invalid credential-helper routing field"
                );
                *destination = Some(value.to_owned());
            }
        }
        Ok(context)
    }

    pub(crate) fn protocol(&self) -> Option<&str> {
        self.protocol.as_deref()
    }
    pub(crate) fn host(&self) -> Option<&str> {
        self.host.as_deref()
    }
    pub(crate) fn path(&self) -> Option<&str> {
        self.path.as_deref()
    }
    pub(crate) fn username(&self) -> Option<&str> {
        self.username.as_deref()
    }
}

/// Encode only an already authorized username and token. The caller owns the
/// lease and must not expose these bytes through normal command output.
pub(crate) fn encode_authorized(username: &str, token: &str) -> Result<Vec<u8>> {
    ensure!(
        !username.is_empty()
            && username.len() <= 256
            && !token.is_empty()
            && !username.chars().any(char::is_control)
            && !token.chars().any(char::is_control),
        "Invalid authorized credential"
    );
    let size = username
        .len()
        .checked_add(token.len())
        .and_then(|size| size.checked_add(b"username=\npassword=\n\n".len()))
        .ok_or_else(|| anyhow!("Authorized credential exceeds the supported size"))?;
    ensure!(
        size <= MAX_INPUT_BYTES && token.len() + b"password=\n".len() <= MAX_LINE_BYTES,
        "Authorized credential exceeds the supported size"
    );
    let mut output = Vec::with_capacity(size);
    output.extend_from_slice(b"username=");
    output.extend_from_slice(username.as_bytes());
    output.extend_from_slice(b"\npassword=");
    output.extend_from_slice(token.as_bytes());
    output.extend_from_slice(b"\n\n");
    Ok(output)
}

/// Git stops consulting further helpers and disables prompts after quit=true.
/// The helper must exit successfully after writing this refusal for `get`.
pub(crate) fn refusal() -> &'static [u8] {
    b"quit=true\n\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn routing_is_literal_and_secret_fields_are_not_echoed() {
        let context = CredentialContext::parse(b"protocol=https\nhost=github.com:8443\npath=owner/repo.git\nusername=User\npassword=private=bytes\noauth_refresh_token=other-private\nwwwauth[]=first\nwwwauth[]=second\ncapability[]=authtype\n\n").unwrap();
        assert_eq!(context.protocol(), Some("https"));
        assert_eq!(context.host(), Some("github.com:8443"));
        assert_eq!(context.path(), Some("owner/repo.git"));
        assert_eq!(context.username(), Some("User"));
        assert_eq!(
            encode_authorized("Chosen", "synthetic-token").unwrap(),
            b"username=Chosen\npassword=synthetic-token\n\n"
        );
        assert_eq!(refusal(), b"quit=true\n\n");
    }

    #[test]
    fn singleton_duplicates_and_ambiguous_url_resets_are_rejected() {
        for key in [
            "protocol",
            "host",
            "path",
            "username",
            "password",
            "oauth_refresh_token",
            "credential",
            "unknown",
        ] {
            let input = format!("{key}=private-first\n{key}=private-second\n");
            let error = CredentialContext::parse(input.as_bytes()).err().unwrap();
            assert!(!error.to_string().contains("private"));
        }
        assert!(CredentialContext::parse(b"url=https://github.com/owner/repo\n").is_err());
    }

    #[test]
    fn framing_controls_and_limits_fail_without_disclosing_input() {
        for input in [
            b"host=private\0value\n".as_slice(),
            b"path=private\rvalue\n",
            b"host=private\r",
            b"missing-equals-private\n",
            b"=private\n",
            b"host=one\n\nhost=private-two\n",
        ] {
            let error = CredentialContext::parse(input).err().unwrap();
            assert!(!error.to_string().contains("private"));
        }
        assert!(CredentialContext::parse(&vec![b'x'; MAX_INPUT_BYTES + 1]).is_err());
        assert!(CredentialContext::parse(&vec![b'x'; MAX_LINE_BYTES + 1]).is_err());
        assert!(
            CredentialContext::parse("wwwauth[]=x\n".repeat(MAX_FIELDS + 1).as_bytes()).is_err()
        );
        assert!(CredentialContext::parse(b"protocol=https\r\nhost=github.com\r\n\r\n").is_ok());
        assert!(CredentialContext::parse(b"protocol=https\nhost=github.com").is_ok());
    }

    #[test]
    fn output_cannot_inject_fields_and_has_a_bounded_size() {
        for (username, token) in [
            ("", "synthetic"),
            ("User", ""),
            ("User\npassword=private", "synthetic"),
            ("User", "private\rquit=false"),
            ("User", "private\0value"),
        ] {
            let error = encode_authorized(username, token).unwrap_err();
            assert!(!error.to_string().contains("private"));
        }
        assert!(encode_authorized("User", &"x".repeat(MAX_INPUT_BYTES)).is_err());
        assert!(Operation::parse("get").unwrap() == Operation::Get);
        assert!(Operation::parse("store").unwrap() == Operation::Store);
        assert!(Operation::parse("erase").unwrap() == Operation::Erase);
        assert!(Operation::parse("fill").is_err());
        assert!(Operation::parse("get\nprivate").is_err());
    }
}
