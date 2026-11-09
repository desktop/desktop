//! Refuse authentication sources that can bypass an assigned credential helper.
//!
//! This is a read-only preflight before the task-local broker is installed.
//! Git LFS checks netrc before `git credential` and does not implement Git's
//! empty-value reset for repeated HTTP extra headers. Never attach inspected
//! values, file names, or command diagnostics to errors from this module.
use super::endpoint::Endpoint;
use crate::{args, cancellation, process};
use anyhow::{Result, anyhow, ensure};
use std::{
    fs::File,
    io::{ErrorKind, Read},
    path::Path,
};

const MAX_CONFIG_BYTES: usize = 2 * 1024 * 1024;
const MAX_NETRC_BYTES: usize = 1024 * 1024;
const INSPECTION_ERROR: &str =
    "Cannot safely inspect authentication sources for the assigned GitHub account";
const HEADER_CONFLICT: &str = "Configured authentication headers can bypass the assigned GitHub account; remove those headers for this repository before retrying";
const NETRC_CONFLICT: &str = "A matching netrc entry can bypass the assigned GitHub account; remove that host entry before retrying";

/// Inspect only the assigned HTTPS endpoints; unrelated transports remain native.
pub(crate) async fn check(path: &Path, endpoints: &[Endpoint]) -> Result<()> {
    if endpoints.is_empty() {
        return Ok(());
    }
    check_headers(&config_entries(path).await?, endpoints)?;
    // Git LFS's ParseNetrc uses HOME only, including on Windows. Do not change
    // HOME, write a replacement file, or inherit curl's different NETRC policy.
    let Some(home) = std::env::var_os("HOME").filter(|home| !home.is_empty()) else {
        return Ok(());
    };
    let endpoints = endpoints.to_vec();
    cancellation::blocking(move || {
        if let Some(bytes) = read_netrc(Path::new(&home))? {
            ensure!(!netrc_conflicts(&bytes, &endpoints), NETRC_CONFLICT);
        }
        Ok(())
    })
    .await
}

/// Collect ordered private config values for preflight and command-only overrides.
/// Call before entering the credential broker scope. Values can contain secrets
/// and must never be logged, serialized, or interpolated into diagnostics.
pub(crate) async fn config_entries(path: &Path) -> Result<Vec<(String, String)>> {
    let cancellation = cancellation::Cancellation::current();
    cancellation.check()?;
    let output = process::run(
        path,
        &args(&[
            "config",
            "--null",
            "--get-regexp",
            "^((credential|http)\\.|lfs\\..*\\.access$)",
        ]),
    )
    .await;
    cancellation.check()?;
    let output = output.map_err(|_| anyhow!(INSPECTION_ERROR))?;
    ensure!(
        output.code == 0 || (output.code == 1 && output.stdout.is_empty()),
        INSPECTION_ERROR
    );
    parse_config(&output.stdout)
}

fn parse_config(bytes: &[u8]) -> Result<Vec<(String, String)>> {
    ensure!(bytes.len() <= MAX_CONFIG_BYTES, INSPECTION_ERROR);
    if bytes.is_empty() {
        return Ok(Vec::new());
    }
    ensure!(bytes.last() == Some(&0), INSPECTION_ERROR);
    let mut entries = Vec::new();
    for record in bytes[..bytes.len() - 1].split(|byte| *byte == 0) {
        let separator = record.iter().position(|byte| *byte == b'\n');
        let (key, value) = match separator {
            Some(index) => (&record[..index], &record[index + 1..]),
            None => (record, &[][..]),
        };
        let key = std::str::from_utf8(key).map_err(|_| anyhow!(INSPECTION_ERROR))?;
        let value = std::str::from_utf8(value).map_err(|_| anyhow!(INSPECTION_ERROR))?;
        ensure!(
            !key.is_empty() && !key.chars().any(char::is_control),
            INSPECTION_ERROR
        );
        entries.push((key.to_owned(), value.to_owned()));
    }
    Ok(entries)
}

fn check_headers(entries: &[(String, String)], endpoints: &[Endpoint]) -> Result<()> {
    for (key, value) in entries {
        let lower = key.to_ascii_lowercase();
        let scope = if lower == "http.extraheader" {
            None
        } else if lower.starts_with("http.") && lower.ends_with(".extraheader") {
            Some(&key[5..key.len() - ".extraheader".len()])
        } else {
            continue;
        };
        // Inspect every value. An empty later value does not erase earlier
        // same-key headers in Git LFS, unlike native Git's HTTP adapter.
        let authentication = value.split(['\r', '\n']).any(|line| {
            line.split_once(':').is_some_and(|(name, _)| {
                ["authorization", "proxy-authorization", "cookie"]
                    .iter()
                    .any(|expected| name.trim().eq_ignore_ascii_case(expected))
            })
        });
        if authentication
            && endpoints
                .iter()
                .any(|endpoint| scope.is_none_or(|scope| scope_applies(scope, endpoint)))
        {
            return Err(anyhow!(HEADER_CONFLICT));
        }
    }
    Ok(())
}

fn scope_applies(scope: &str, endpoint: &Endpoint) -> bool {
    let Some((scheme, remainder)) = scope.split_once("://") else {
        return false;
    };
    if !scheme.eq_ignore_ascii_case("https") {
        return false;
    }
    let remainder = remainder.split(['?', '#']).next().unwrap_or(remainder);
    let (authority, path) = remainder.split_once('/').unwrap_or((remainder, ""));
    let Some(authority) = decode_scope(authority) else {
        return false;
    };
    // Operation endpoints have no userinfo, so username-specific HTTP config
    // cannot match them. Passwords in config URLs must not reach diagnostics.
    if authority.contains(['@', '/', '\\', '?', '#']) {
        return false;
    }
    let (host, port) = match authority.rsplit_once(':') {
        Some((host, port)) => {
            let Ok(port) = port.parse::<u16>() else {
                return false;
            };
            (host, port)
        }
        None => (authority.as_str(), 443),
    };
    if port != endpoint.origin.port || !host_matches(host, &endpoint.origin.host) {
        return false;
    }
    let Some(path) = decode_scope(path) else {
        // An ambiguous path on the protected origin cannot certify isolation.
        return true;
    };
    let path = path.trim_matches('/').to_ascii_lowercase();
    let repository = format!("{}/{}", endpoint.owner, endpoint.name);
    [repository.clone(), format!("{repository}.git")]
        .iter()
        .any(|candidate| path_prefix(&path, candidate) || path_prefix(candidate, &path))
}

fn path_prefix(prefix: &str, path: &str) -> bool {
    prefix.is_empty()
        || path == prefix
        || path
            .strip_prefix(prefix)
            .is_some_and(|rest| rest.starts_with('/'))
}

fn host_matches(pattern: &str, host: &str) -> bool {
    let pattern = pattern.to_ascii_lowercase();
    let host = host.to_ascii_lowercase();
    let pattern = pattern.split('.').collect::<Vec<_>>();
    let host = host.split('.').collect::<Vec<_>>();
    pattern.len() == host.len()
        && pattern.iter().zip(host).all(|(pattern, host)| {
            let mut remainder = host;
            let mut pieces = pattern.split('*');
            let first = pieces.next().unwrap_or("");
            if !remainder.starts_with(first) {
                return false;
            }
            remainder = &remainder[first.len()..];
            let pieces = pieces.collect::<Vec<_>>();
            if pieces.is_empty() {
                return remainder.is_empty();
            }
            for (index, piece) in pieces.iter().enumerate() {
                if index + 1 == pieces.len() {
                    return remainder.ends_with(piece);
                }
                let Some(offset) = remainder.find(piece) else {
                    return false;
                };
                remainder = &remainder[offset + piece.len()..];
            }
            false
        })
}

fn decode_scope(value: &str) -> Option<String> {
    let mut decoded = Vec::with_capacity(value.len());
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        decoded.push(if byte == b'%' {
            let high = char::from(bytes.next()?).to_digit(16)?;
            let low = char::from(bytes.next()?).to_digit(16)?;
            u8::try_from(high * 16 + low).ok()?
        } else {
            byte
        });
    }
    let decoded = String::from_utf8(decoded).ok()?;
    (!decoded.chars().any(char::is_control)).then_some(decoded)
}

fn read_netrc(home: &Path) -> Result<Option<Vec<u8>>> {
    let path = home.join(".netrc");
    let metadata = match std::fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => {
            #[cfg(windows)]
            return read_netrc_file(&home.join("_netrc"));
            #[cfg(not(windows))]
            return Ok(None);
        }
        Err(_) => return Err(anyhow!(INSPECTION_ERROR)),
    };
    ensure!(metadata.is_file(), INSPECTION_ERROR);
    read_netrc_file(&path)
}

fn read_netrc_file(path: &Path) -> Result<Option<Vec<u8>>> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(anyhow!(INSPECTION_ERROR)),
    };
    ensure!(
        file.metadata()
            .map_err(|_| anyhow!(INSPECTION_ERROR))?
            .is_file(),
        INSPECTION_ERROR
    );
    let mut bytes = Vec::new();
    file.take((MAX_NETRC_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| anyhow!(INSPECTION_ERROR))?;
    ensure!(bytes.len() <= MAX_NETRC_BYTES, INSPECTION_ERROR);
    cancellation::Cancellation::current().check()?;
    Ok(Some(bytes))
}

fn netrc_conflicts(bytes: &[u8], endpoints: &[Endpoint]) -> bool {
    // go-netrc (used by LFS) scans Unicode whitespace, treats token-leading '#'
    // as a comment, and gives quotes/backslashes no special interpretation.
    let text = String::from_utf8_lossy(bytes);
    let mut remaining = text.as_ref();
    while let Some(token) = netrc_token(&mut remaining) {
        match token {
            "default" => return true,
            "machine" => {
                let name = netrc_token(&mut remaining).unwrap_or("");
                // An unnamed machine is treated as a default by go-netrc.
                // LFS strips the request port before its machine-name lookup.
                if name.is_empty()
                    || endpoints
                        .iter()
                        .any(|endpoint| name.eq_ignore_ascii_case(&endpoint.origin.host))
                {
                    return true;
                }
            }
            "login" | "password" | "account" | "macdef" => {
                // These values can themselves equal a recognized keyword.
                // Recognized tokens in macro bodies are still interpreted by
                // go-netrc; do not hide a potentially matching machine there.
                netrc_token(&mut remaining);
            }
            _ => {}
        }
    }
    false
}

fn netrc_token<'a>(remaining: &mut &'a str) -> Option<&'a str> {
    *remaining = remaining.trim_start_matches(char::is_whitespace);
    if remaining.is_empty() {
        return None;
    }
    let end = if remaining.starts_with('#') {
        remaining.find('\n')
    } else {
        remaining.find(char::is_whitespace)
    }
    .unwrap_or(remaining.len());
    let token = &remaining[..end];
    *remaining = &remaining[end..];
    Some(token)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn endpoints() -> Vec<Endpoint> {
        vec![Endpoint::from_operation_url("https://github.com/owner/repo.git").unwrap()]
    }

    #[test]
    fn config_inventory_preserves_order_empty_resets_and_multiline_private_values() {
        let entries = parse_config(
            b"credential.helper\nold\0credential.https://github.com.helper\n\0http.extraheader\nX-Test: one\ntwo\0lfs.https://github.com/owner/repo.git/info/lfs.access\nbasic\0",
        )
        .unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].0, "credential.helper");
        assert_eq!(entries[1].1, "");
        assert_eq!(entries[2].1, "X-Test: one\ntwo");
        assert_eq!(entries[3].1, "basic");
        for bytes in [
            b"http.extraheader\nprivate-value".as_slice(),
            b"http.\rprivate\nvalue\0",
            b"http.extraheader\nprivate-\xff\0",
            b"\0",
        ] {
            let error = parse_config(bytes).unwrap_err();
            assert_eq!(error.to_string(), INSPECTION_ERROR);
            assert!(!format!("{error:?}").contains("private"));
        }
    }

    #[test]
    fn protected_headers_fail_even_after_empty_resets_without_echoing_values() {
        for key in [
            "http.extraheader",
            "http.https://github.com.extraheader",
            "http.https://github.com/owner.extraheader",
            "http.https://github.com/Owner/Repo.git/info/lfs/objects/batch.extraheader",
            "http.https://%67ithub.com:0443/%6fwner/repo.extraheader",
        ] {
            for value in [
                "Authorization: Basic private-value",
                "pRoXy-AuThOrIzAtIoN: private-value",
                "Cookie: private-value",
                "X-Test: safe\nAuthorization: private-value",
            ] {
                let entries = vec![(key.into(), value.into()), (key.into(), "".into())];
                let error = check_headers(&entries, &endpoints()).unwrap_err();
                assert_eq!(error.to_string(), HEADER_CONFLICT);
                assert!(!format!("{error:?}").contains("private-value"));
            }
        }
    }

    #[test]
    fn unrelated_hosts_ports_paths_and_non_auth_headers_remain_native() {
        for key in [
            "http.https://other.example/owner/repo.extraheader",
            "http.https://github.com:8443/owner/repo.extraheader",
            "http.http://github.com/owner/repo.extraheader",
            "http.https://github.com/other/repo.extraheader",
            "http.https://github.com/owner/repo-other.extraheader",
            "http.https://github.com/owner-other/repo.extraheader",
            "http.https://other@github.com/owner/repo.extraheader",
        ] {
            assert!(
                check_headers(
                    &[(key.into(), "Authorization: private-value".into())],
                    &endpoints()
                )
                .is_ok()
            );
        }
        assert!(
            check_headers(
                &[("http.extraheader".into(), "X-Trace: safe".into())],
                &endpoints()
            )
            .is_ok()
        );
        assert!(
            check_headers(
                &[("http.extraheader".into(), "Authorization: value".into())],
                &[]
            )
            .is_ok()
        );
        let enterprise =
            Endpoint::from_operation_url("https://git.example.com:8443/owner/repo").unwrap();
        assert!(scope_applies(
            "https://*.example.com:8443/owner",
            &enterprise
        ));
        assert!(!scope_applies("https://*.com:8443/owner", &enterprise));
    }

    #[test]
    fn netrc_inventory_matches_protected_host_regardless_of_request_port() {
        let mut protected = endpoints();
        protected.push(
            Endpoint::from_operation_url("https://enterprise.example:8443/owner/repo").unwrap(),
        );
        for bytes in [
            b"machine github.com login old password private-value".as_slice(),
            b"machine GitHub.COM\nlogin old\npassword private-value\n",
            b"machine enterprise.example login old password private-value",
            b"default login old password private-value",
            b"machine github.com",
            b"machine",
            "unknown ignored\nmachine\u{2003}github.com".as_bytes(),
        ] {
            assert!(netrc_conflicts(bytes, &protected));
        }
    }

    #[test]
    fn netrc_other_hosts_comments_and_keyword_values_do_not_claim_the_target() {
        for bytes in [
            b"machine other.example login bob password private-value".as_slice(),
            b"# machine github.com login old\nmachine other.example password value",
            b"machine github.com:443 login old password value",
            b"machine other.example login machine password default account github.com",
            b"macdef machine\nignored text\n\nmachine other.example password value",
            b"machine \"github.com\" login old password value",
            b"machine other.example password token#literal",
        ] {
            assert!(!netrc_conflicts(bytes, &endpoints()));
        }
        assert!(netrc_conflicts(
            b"macdef example\nunknown macro text\nmachine github.com password private-value\n",
            &endpoints()
        ));
    }
}
