//! Credential targets derived from the current typed operation, never from a
//! helper's requested URL or the set of every configured remote.
//!
//! The outer PR-checkout scope covers its declared base and saved source.
//! After the fixed API head proof, a nested checkout scope also grants its
//! declared head fetch remote through native checkout and hooks. Submodule
//! operations receive no parent repository grant. Clone has a separate scope.
use super::endpoint::{Endpoint, EndpointKind, Origin};
use crate::{LfsTransferRequest, Operation, Repository, args, process};
use anyhow::{Context, Result, anyhow, ensure};

const MAX_TARGETS: usize = 32;
const MAX_CONFIG_VALUES: usize = 128;
const MAX_URL_BYTES: usize = 16 * 1024;

#[derive(Clone, Copy)]
enum Direction {
    Source,
    Fetch,
    Push,
    Deletion,
}

/// Resolve only HTTPS destinations on the explicitly assigned web origin.
/// An empty result does not authorize native-account fallback on that origin.
pub(crate) async fn collect(
    repository: &Repository,
    operation: &Operation,
    assigned_host: &str,
    checkout_head_remote: Option<&str>,
) -> Result<Vec<Endpoint>> {
    let mut endpoints = collect_operation(repository, operation, assigned_host).await?;
    if let Some(remote) = checkout_head_remote {
        let head = Operation::Fetch {
            remote: remote.to_owned(),
        };
        for endpoint in collect_operation(repository, &head, assigned_host).await? {
            append_unique(&mut endpoints, endpoint);
        }
        ensure!(
            endpoints.len() <= MAX_TARGETS,
            "Too many assigned-account credential destinations"
        );
    }
    Ok(endpoints)
}

async fn collect_operation(
    repository: &Repository,
    operation: &Operation,
    assigned_host: &str,
) -> Result<Vec<Endpoint>> {
    let protected = Endpoint::from_operation_url(&format!(
        "https://{assigned_host}/credential-owner/credential-repository"
    ))?
    .origin;
    let mut requests = Vec::new();
    match operation {
        Operation::Fetch { remote } | Operation::Pull { remote, .. } => {
            requests.push((remote.clone(), Direction::Fetch));
        }
        Operation::Push { remote, .. } => requests.push((remote.clone(), Direction::Push)),
        Operation::RemoteBranchDeletePreview { request }
        | Operation::DeleteRemoteBranch { request, .. } => {
            requests.push((request.remote.clone(), Direction::Deletion));
        }
        Operation::DeleteBranchPreview {
            name,
            upstream: Some(_),
            ..
        }
        | Operation::DeleteBranch {
            name,
            upstream: Some(_),
            ..
        } => {
            // Match combined_deletion_plan exactly: the branch's configured
            // upstream controls deletion; pushRemote is a different concept.
            let reference = format!(
                "refs/heads/{}",
                name.strip_prefix("refs/heads/").unwrap_or(name)
            );
            let targets = repository.remote_deletion_targets().await?;
            let remote = targets["upstreams"]
                .as_array()
                .and_then(|targets| {
                    targets
                        .iter()
                        .find(|target| target["local_ref"] == reference)
                })
                .and_then(|target| target["remote"].as_str())
                .context("Selected local branch has no configured network upstream")?;
            requests.push((remote.into(), Direction::Deletion));
            if matches!(operation, Operation::DeleteBranch { .. }) {
                source_request(repository, &mut requests).await?;
            }
        }
        Operation::LfsTransfer { request } => match request {
            LfsTransferRequest::Fetch { remote, .. } | LfsTransferRequest::Pull { remote, .. } => {
                requests.push((remote.clone(), Direction::Fetch));
            }
            LfsTransferRequest::Push { remote, .. } => {
                requests.push((remote.clone(), Direction::Push))
            }
        },
        Operation::Github { request }
            if matches!(
                request.action,
                crate::GitHubAction::CheckoutPullRequest { .. }
            ) =>
        {
            let identity = if let Some(selector) = &request.repository {
                crate::github::validate_repository(selector)?;
                let parts = selector.split('/').collect::<Vec<_>>();
                match parts.as_slice() {
                    [owner, name] => crate::RepositoryIdentity::from_url(&format!(
                        "https://{assigned_host}/{owner}/{name}"
                    ))?,
                    [host, owner, name] => crate::RepositoryIdentity::from_url(&format!(
                        "https://{host}/{owner}/{name}"
                    ))?,
                    _ => return Err(anyhow!("Invalid pull request repository selector")),
                }
            } else {
                repository
                    .selected_binding()
                    .await?
                    .identity
                    .context("Select a recognized pull request base repository")?
            };
            ensure!(
                identity.host.eq_ignore_ascii_case(assigned_host),
                "Pull request base host differs from the assigned account"
            );
            let remote = repository.pull_request_remote(&identity).await?;
            requests.push((remote, Direction::Fetch));
            source_request(repository, &mut requests).await?;
        }
        Operation::SubmoduleAdd { .. } | Operation::SubmoduleUpdate { .. } => {
            return Ok(Vec::new());
        }
        // Hooks, filters and partial-clone object reads may invoke nested Git.
        // Bind those to the saved source fetch remote, including the persisted
        // source_remote fallback when the repository has no origin.
        _ => source_request(repository, &mut requests).await?,
    }
    if requests.is_empty() {
        return Ok(Vec::new());
    }
    let rewrites = read_rewrites(repository).await?;
    let mut endpoints = Vec::new();
    for (remote, direction) in requests {
        validate_remote_name(&remote)?;
        let urls = match remote_urls(repository, &remote, direction, &protected).await {
            Ok(urls) => urls,
            Err(_) if matches!(direction, Direction::Source) => {
                // A removed optional source remote cannot make a local command
                // require authentication. Its nested helpers receive no grant.
                crate::cancellation::Cancellation::current().check()?;
                continue;
            }
            Err(error) => return Err(error),
        };
        let mut intended = Vec::new();
        for url in urls {
            if let Some(endpoint) = protected_endpoint(&url, &protected)? {
                ensure!(
                    endpoint.kind == EndpointKind::Git,
                    "A Git remote must identify a repository before using the assigned account"
                );
                append_unique(&mut intended, endpoint);
            }
        }
        if !intended.is_empty() {
            // Explicit LFS configuration can select the conventional endpoint
            // of an intended repository, but never creates a new grant.
            validate_lfs_configuration(
                repository, &remote, direction, &protected, &intended, &rewrites,
            )
            .await?;
        }
        for endpoint in intended {
            append_unique(&mut endpoints, endpoint);
        }
    }
    ensure!(
        endpoints.len() <= MAX_TARGETS,
        "Too many assigned-account credential destinations"
    );
    Ok(endpoints)
}

async fn source_request(
    repository: &Repository,
    requests: &mut Vec<(String, Direction)>,
) -> Result<()> {
    if let Some(remote) = repository.selected_binding().await?.remote {
        requests.push((remote, Direction::Source));
    }
    Ok(())
}

fn validate_remote_name(remote: &str) -> Result<()> {
    ensure!(
        !remote.is_empty() && remote.len() <= 4096 && !remote.contains(['\0', '\n', '\r']),
        "Invalid credential destination remote name"
    );
    Ok(())
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum LfsConfigSource {
    WorkingTree,
    Blob(String),
    Absent,
}

const LFS_CONFIG_UNAVAILABLE: &str = "Git LFS configuration cannot be inspected locally; fetch missing repository objects with the intended account, resolve .lfsconfig conflicts, and retry";

async fn values(
    repository: &Repository,
    key: &str,
    source: Option<&LfsConfigSource>,
) -> Result<Vec<String>> {
    let mut command = if matches!(source, Some(LfsConfigSource::Blob(_))) {
        args(&["--no-lazy-fetch", "config", "--includes", "--null"])
    } else {
        args(&["config", "--includes", "--null"])
    };
    match source {
        Some(LfsConfigSource::WorkingTree) => command.extend(args(&["--file", ".lfsconfig"])),
        Some(LfsConfigSource::Blob(oid)) => command.extend(args(&["--blob", oid])),
        Some(LfsConfigSource::Absent) => return Ok(Vec::new()),
        None => {}
    }
    command.extend(args(&["--get-all", key]));
    let output = process::run_checkout(repository.path(), &command).await?;
    ensure!(
        output.code == 0
            || output.code == 1
                && output.stdout.is_empty()
                && (source.is_none() || output.stderr.is_empty()),
        if source.is_some() {
            LFS_CONFIG_UNAVAILABLE
        } else {
            "Cannot inspect credential destination configuration"
        }
    );
    let mut values = Vec::new();
    // Empty values reset a remote's URL list. Preserve them for deletion's
    // explicit reset semantics instead of silently discarding reset entries.
    if output.code == 0 {
        let rows = output
            .stdout
            .strip_suffix(b"\0")
            .context("Invalid credential destination configuration")?;
        for value in rows.split(|byte| *byte == 0) {
            ensure!(
                values.len() < MAX_CONFIG_VALUES,
                "Too many credential destination configuration values"
            );
            let value = std::str::from_utf8(value)
                .map_err(|_| anyhow!("Invalid credential destination configuration"))?;
            ensure!(
                value.len() <= MAX_URL_BYTES && !value.contains(['\0', '\r', '\n']),
                "Credential destination contains unsupported line delimiters"
            );
            values.push(value.to_owned());
        }
    }
    Ok(values)
}

fn after_last_reset(mut values: Vec<String>) -> Vec<String> {
    if let Some(at) = values.iter().rposition(String::is_empty) {
        values.drain(..=at);
    }
    values
}

async fn remote_urls(
    repository: &Repository,
    remote: &str,
    direction: Direction,
    protected: &Origin,
) -> Result<Vec<String>> {
    let fetch = values(repository, &format!("remote.{remote}.url"), None).await?;
    let push = if matches!(direction, Direction::Push | Direction::Deletion) {
        values(repository, &format!("remote.{remote}.pushurl"), None).await?
    } else {
        Vec::new()
    };
    if matches!(direction, Direction::Deletion) {
        // The reviewed deletion implementation isolates each post-reset raw
        // URL before asking Git to apply insteadOf/pushInsteadOf. Mirror its
        // destination list rather than granting reset/earlier destinations.
        let push = after_last_reset(push);
        let explicit = !push.is_empty();
        let selected = if explicit {
            push
        } else {
            after_last_reset(fetch)
        };
        ensure!(
            !selected.is_empty() && selected.len() <= MAX_TARGETS,
            "Remote must have between 1 and 32 push destinations"
        );
        let mut urls = Vec::new();
        for url in selected {
            protected_endpoint(&url, protected)?;
            let key = if explicit { "pushurl" } else { "url" };
            let mut command = args(&[
                "-c",
                &format!("remote.{remote}.{key}="),
                "-c",
                &format!("remote.{remote}.{key}={url}"),
            ]);
            if !explicit {
                command.extend(args(&["-c", &format!("remote.{remote}.pushurl=")]));
            }
            command.extend(args(&[
                "remote", "get-url", "--push", "--all", "--", remote,
            ]));
            let output = process::run_checkout(repository.path(), &command).await?;
            ensure!(
                output.code == 0,
                "Cannot resolve credential push destination"
            );
            let isolated = lines(&output.stdout)?;
            ensure!(
                isolated.len() == 1,
                "Cannot isolate one credential push destination"
            );
            urls.extend(isolated);
        }
        return Ok(urls);
    }
    let mut command = args(&["remote", "get-url"]);
    if matches!(direction, Direction::Push) {
        command.extend(args(&["--push", "--all"]));
    }
    command.extend(args(&["--", remote]));
    let output = process::run_checkout(repository.path(), &command).await?;
    ensure!(
        output.code == 0,
        "Cannot resolve credential destination remote"
    );
    let urls = lines(&output.stdout)?;
    ensure!(
        !urls.is_empty() && urls.len() <= MAX_TARGETS,
        "Remote must have between 1 and 32 credential destinations"
    );
    ensure!(
        !matches!(direction, Direction::Fetch | Direction::Source) || urls.len() == 1,
        "Cannot isolate one credential fetch destination"
    );
    Ok(urls)
}

fn lines(bytes: &[u8]) -> Result<Vec<String>> {
    let value =
        std::str::from_utf8(bytes).map_err(|_| anyhow!("Invalid credential destination output"))?;
    let value = value
        .strip_suffix('\n')
        .context("Invalid credential destination output")?;
    value
        .split('\n')
        .map(|value| {
            ensure!(
                !value.is_empty() && value.len() <= MAX_URL_BYTES && !value.contains(['\r', '\0']),
                "Invalid credential destination output"
            );
            Ok(value.to_owned())
        })
        .collect()
}

struct UrlRewrite {
    base: String,
    prefix: String,
    push: bool,
}

async fn read_rewrites(repository: &Repository) -> Result<Vec<UrlRewrite>> {
    let output = process::run_checkout(
        repository.path(),
        &args(&[
            "config",
            "--null",
            "--get-regexp",
            r"^url\..*\.(insteadof|pushinsteadof)$",
        ]),
    )
    .await?;
    ensure!(
        matches!(output.code, 0 | 1),
        "Cannot inspect credential URL rewriting"
    );
    let mut rules = Vec::new();
    for (index, row) in output
        .stdout
        .split(|byte| *byte == 0)
        .filter(|row| !row.is_empty())
        .enumerate()
    {
        ensure!(
            index < MAX_CONFIG_VALUES
                && row.iter().filter(|byte| **byte == b'\n').count() == 1
                && !row.contains(&b'\r'),
            "Invalid credential URL rewriting configuration"
        );
        let at = row
            .iter()
            .position(|byte| *byte == b'\n')
            .context("Invalid credential URL rewriting configuration")?;
        let key = std::str::from_utf8(&row[..at])
            .map_err(|_| anyhow!("Invalid credential URL rewriting configuration"))?;
        let prefix = std::str::from_utf8(&row[at + 1..])
            .map_err(|_| anyhow!("Invalid credential URL rewriting configuration"))?;
        let key = key
            .strip_prefix("url.")
            .context("Invalid credential URL rewriting configuration")?;
        let (base, push) = if let Some(base) = key.strip_suffix(".pushinsteadof") {
            (base, true)
        } else {
            (
                key.strip_suffix(".insteadof")
                    .context("Invalid credential URL rewriting configuration")?,
                false,
            )
        };
        ensure!(
            base.len() <= MAX_URL_BYTES && prefix.len() <= MAX_URL_BYTES,
            "Invalid credential URL rewriting configuration"
        );
        rules.push(UrlRewrite {
            base: base.into(),
            prefix: prefix.into(),
            push,
        });
    }
    Ok(rules)
}

/// LFS applies one longest prefix replacement, preferring push aliases for
/// uploads even when the underlying remote has an explicit pushurl. Ambiguous
/// duplicate aliases are refused because native LFS builds them from a map.
fn rewrite_lfs_url(value: &str, upload: bool, rules: &[UrlRewrite]) -> Result<String> {
    for push in [true, false] {
        if push && !upload {
            continue;
        }
        let matching = rules
            .iter()
            .filter(|rule| {
                rule.push == push && !rule.prefix.is_empty() && value.starts_with(&rule.prefix)
            })
            .collect::<Vec<_>>();
        let Some(length) = matching.iter().map(|rule| rule.prefix.len()).max() else {
            continue;
        };
        let mut selected = matching
            .into_iter()
            .filter(|rule| rule.prefix.len() == length);
        let rule = selected.next().context("Invalid Git LFS URL alias")?;
        ensure!(
            selected.all(|other| other.base == rule.base),
            "Ambiguous Git LFS URL alias configuration"
        );
        let expanded = format!("{}{}", rule.base, &value[length..]);
        ensure!(
            expanded.len() <= MAX_URL_BYTES,
            "Git LFS URL alias exceeds the supported size"
        );
        return Ok(expanded);
    }
    Ok(value.into())
}

/// Classify the authority without granting anything. Only a complete strict
/// endpoint can produce a grant; the probe merely identifies unsafe URLs on
/// the assigned host so their embedded credential/query bytes never get used.
fn protected_endpoint(url: &str, protected: &Origin) -> Result<Option<Endpoint>> {
    let Some((scheme, remainder)) = url.split_once("://") else {
        return Ok(None);
    };
    if !scheme.eq_ignore_ascii_case("https") && !scheme.eq_ignore_ascii_case("http") {
        return Ok(None);
    }
    let authority = remainder.split(['/', '?', '#']).next().unwrap_or_default();
    let authority = authority.rsplit('@').next().unwrap_or_default();
    let authority = decode_probe(authority);
    let probe = Endpoint::from_operation_url(&format!(
        "https://{authority}/credential-owner/credential-repository"
    ));
    if !probe.is_ok_and(|probe| probe.origin == *protected) {
        return Ok(None);
    }
    let endpoint = Endpoint::from_operation_url(url)
        .map_err(|_| anyhow!("The assigned-account destination requires a credential-free HTTPS repository URL without query or fragment"))?;
    Ok(Some(endpoint))
}

fn decode_probe(value: &str) -> String {
    let mut decoded = Vec::with_capacity(value.len());
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        if byte == b'%' {
            let Some(high) = bytes.next().and_then(|byte| (byte as char).to_digit(16)) else {
                return value.into();
            };
            let Some(low) = bytes.next().and_then(|byte| (byte as char).to_digit(16)) else {
                return value.into();
            };
            decoded.push((high * 16 + low) as u8);
        } else {
            decoded.push(byte);
        }
    }
    String::from_utf8(decoded).unwrap_or_else(|_| value.into())
}

async fn validate_lfs_configuration(
    repository: &Repository,
    remote: &str,
    direction: Direction,
    protected: &Origin,
    intended: &[Endpoint],
    rewrites: &[UrlRewrite],
) -> Result<()> {
    // Follow endpoint_finder.go priority: global pushurl/url precede the
    // selected remote's lfspushurl/lfsurl. A Git setting overrides .lfsconfig
    // for the same key, and only its final scalar value is effective.
    let mut keys = Vec::new();
    if matches!(direction, Direction::Push | Direction::Deletion) {
        keys.push("lfs.pushurl".to_owned());
    }
    keys.push("lfs.url".to_owned());
    if matches!(direction, Direction::Push | Direction::Deletion) {
        keys.push(format!("remote.{remote}.lfspushurl"));
    }
    keys.push(format!("remote.{remote}.lfsurl"));
    let mut source = None;
    for key in keys {
        let mut configured = values(repository, &key, None).await?;
        if configured.is_empty() && lfs_file_key_allowed(&key) {
            if source.is_none() {
                source = Some(lfs_config_source(repository).await?);
            }
            configured = values(repository, &key, source.as_ref()).await?;
        }
        if let Some(url) = configured.last() {
            let url = rewrite_lfs_url(
                url,
                matches!(direction, Direction::Push | Direction::Deletion),
                rewrites,
            )?;
            if let Some(endpoint) = protected_endpoint(&url, protected)? {
                ensure!(
                    intended
                        .iter()
                        .any(|target| target.same_repository(&endpoint)),
                    "The configured Git LFS endpoint is outside this operation's assigned repository scope"
                );
            }
            return Ok(());
        }
    }
    // Without explicit LFS URLs, LFS uses the last configured scalar Git URL
    // and performs its own alias expansion. Validate that path too: its upload
    // rewrite rules can differ from native Git's explicit-pushurl behavior.
    let upload = matches!(direction, Direction::Push | Direction::Deletion);
    let mut urls = if upload {
        values(repository, &format!("remote.{remote}.pushurl"), None).await?
    } else {
        Vec::new()
    };
    if urls.is_empty() {
        urls = values(repository, &format!("remote.{remote}.url"), None).await?;
    }
    if let Some(url) = urls.last() {
        let url = rewrite_lfs_url(url, upload, rewrites)?;
        if let Some(endpoint) = protected_endpoint(&url, protected)? {
            ensure!(
                intended
                    .iter()
                    .any(|target| target.same_repository(&endpoint)),
                "The derived Git LFS endpoint is outside this operation's assigned repository scope"
            );
        }
    }
    Ok(())
}

// Git LFS allows remote.<name>.lfsurl in .lfsconfig, but not lfspushurl.
fn lfs_file_key_allowed(key: &str) -> bool {
    matches!(key, "lfs.url" | "lfs.pushurl")
        || key.starts_with("remote.") && key.ends_with(".lfsurl")
}

/// Follow Git LFS's working-file/index/HEAD precedence without fetching any
/// missing objects before the credential lease exists. Pin the selected blob
/// by OID so a subsequent ref movement cannot change which bytes are inspected.
async fn lfs_config_source(repository: &Repository) -> Result<LfsConfigSource> {
    match tokio::fs::symlink_metadata(repository.path().join(".lfsconfig")).await {
        Ok(metadata) => {
            ensure!(
                metadata.is_file() && !metadata.file_type().is_symlink(),
                LFS_CONFIG_UNAVAILABLE
            );
            return Ok(LfsConfigSource::WorkingTree);
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err(anyhow!(LFS_CONFIG_UNAVAILABLE)),
    }
    let index = process::run_checkout(
        repository.path(),
        &args(&[
            "--no-lazy-fetch",
            "ls-files",
            "--stage",
            "--full-name",
            "-z",
            "--",
            ".lfsconfig",
        ]),
    )
    .await?;
    ensure!(index.code == 0, LFS_CONFIG_UNAVAILABLE);
    if let Some(oid) = config_blob_from_listing(&index.stdout, Listing::Index)? {
        return Ok(LfsConfigSource::Blob(oid));
    }
    let head = process::run_checkout(
        repository.path(),
        &args(&[
            "--no-lazy-fetch",
            "rev-parse",
            "--verify",
            "--quiet",
            "--end-of-options",
            "HEAD",
        ]),
    )
    .await?;
    if head.code == 1 && head.stdout.is_empty() {
        return Ok(LfsConfigSource::Absent);
    }
    ensure!(head.code == 0, LFS_CONFIG_UNAVAILABLE);
    let oid = head
        .stdout
        .strip_suffix(b"\n")
        .ok_or_else(|| anyhow!(LFS_CONFIG_UNAVAILABLE))?;
    ensure!(valid_oid(oid), LFS_CONFIG_UNAVAILABLE);
    let oid = std::str::from_utf8(oid).map_err(|_| anyhow!(LFS_CONFIG_UNAVAILABLE))?;
    let tree = process::run_checkout(
        repository.path(),
        &args(&[
            "--no-lazy-fetch",
            "ls-tree",
            "--full-tree",
            "-z",
            oid,
            "--",
            ".lfsconfig",
        ]),
    )
    .await?;
    ensure!(tree.code == 0, LFS_CONFIG_UNAVAILABLE);
    Ok(config_blob_from_listing(&tree.stdout, Listing::Tree)?
        .map(LfsConfigSource::Blob)
        .unwrap_or(LfsConfigSource::Absent))
}

#[derive(Clone, Copy)]
enum Listing {
    Index,
    Tree,
}

fn valid_oid(oid: &[u8]) -> bool {
    matches!(oid.len(), 40 | 64)
        && oid.iter().all(u8::is_ascii_hexdigit)
        && !oid.iter().all(|byte| *byte == b'0')
}

/// Parse only the exact native .lfsconfig record. Conflicted stages, symlinks,
/// directories, malformed framing and ambiguous extra entries cannot certify
/// which configuration native Git LFS will use.
fn config_blob_from_listing(bytes: &[u8], listing: Listing) -> Result<Option<String>> {
    if bytes.is_empty() {
        return Ok(None);
    }
    let record = bytes
        .strip_suffix(b"\0")
        .ok_or_else(|| anyhow!(LFS_CONFIG_UNAVAILABLE))?;
    ensure!(!record.contains(&0), LFS_CONFIG_UNAVAILABLE);
    let tab = record
        .iter()
        .position(|byte| *byte == b'\t')
        .ok_or_else(|| anyhow!(LFS_CONFIG_UNAVAILABLE))?;
    ensure!(&record[tab + 1..] == b".lfsconfig", LFS_CONFIG_UNAVAILABLE);
    let fields = record[..tab]
        .split(|byte| *byte == b' ')
        .collect::<Vec<_>>();
    ensure!(
        fields.len() == 3 && matches!(fields[0], b"100644" | b"100755"),
        LFS_CONFIG_UNAVAILABLE
    );
    let oid = match listing {
        Listing::Index => {
            ensure!(fields[2] == b"0", LFS_CONFIG_UNAVAILABLE);
            fields[1]
        }
        Listing::Tree => {
            ensure!(fields[1] == b"blob", LFS_CONFIG_UNAVAILABLE);
            fields[2]
        }
    };
    ensure!(valid_oid(oid), LFS_CONFIG_UNAVAILABLE);
    Ok(Some(
        std::str::from_utf8(oid)
            .map_err(|_| anyhow!(LFS_CONFIG_UNAVAILABLE))?
            .to_owned(),
    ))
}

fn append_unique(endpoints: &mut Vec<Endpoint>, endpoint: Endpoint) {
    if !endpoints.iter().any(|existing| existing == &endpoint) {
        endpoints.push(endpoint);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_the_exact_assigned_web_origin_can_create_a_grant() {
        let protected = Endpoint::from_operation_url("https://github.com/owner/repo")
            .unwrap()
            .origin;
        assert!(
            protected_endpoint("https://GitHub.COM:443/owner/repo.git", &protected)
                .unwrap()
                .is_some()
        );
        for url in [
            "https://github.com:8443/owner/repo",
            "https://other.example/owner/repo",
            "ssh://git@github.com:443/owner/repo",
            "git@github.com:owner/repo",
            "/local/repository",
        ] {
            assert!(protected_endpoint(url, &protected).unwrap().is_none());
        }
        for url in [
            "https://private@github.com/owner/repo",
            "https://User:private@github.com/owner/repo",
            "https://github.com/owner/repo?private=value",
            "https://github.com/owner/repo#private",
            "https://%67ithub.com/owner/repo",
            "http://github.com/owner/repo",
            "https://github.com/owner/repo%2fprivate",
        ] {
            let error = protected_endpoint(url, &protected).unwrap_err();
            assert!(!error.to_string().contains("private"));
        }
    }

    #[test]
    fn deletion_reset_entries_do_not_retain_earlier_destinations() {
        let urls = vec![
            "old".into(),
            "".into(),
            "discarded".into(),
            "".into(),
            "first".into(),
            "second".into(),
        ];
        assert_eq!(after_last_reset(urls), vec!["first", "second"]);
        assert!(after_last_reset(vec!["old".into(), "".into()]).is_empty());
        assert_eq!(after_last_reset(vec!["first".into()]), vec!["first"]);
    }

    #[test]
    fn lfs_aliases_use_one_longest_replacement_and_upload_precedence() {
        let rules = vec![
            UrlRewrite {
                base: "https://github.com/".into(),
                prefix: "alias:".into(),
                push: false,
            },
            UrlRewrite {
                base: "https://github.com/owner/".into(),
                prefix: "alias:owner/".into(),
                push: false,
            },
            UrlRewrite {
                base: "https://User:private@github.com/".into(),
                prefix: "alias:".into(),
                push: true,
            },
        ];
        assert_eq!(
            rewrite_lfs_url("alias:owner/repo.git/info/lfs", false, &rules).unwrap(),
            "https://github.com/owner/repo.git/info/lfs"
        );
        let protected = Endpoint::from_operation_url("https://github.com/owner/repo")
            .unwrap()
            .origin;
        let uploaded = rewrite_lfs_url("alias:owner/repo.git/info/lfs", true, &rules).unwrap();
        assert!(protected_endpoint(&uploaded, &protected).is_err());
        let duplicates = vec![
            UrlRewrite {
                base: "https://github.com/".into(),
                prefix: "alias:".into(),
                push: false,
            },
            UrlRewrite {
                base: "https://other.example/".into(),
                prefix: "alias:".into(),
                push: false,
            },
        ];
        assert!(rewrite_lfs_url("alias:owner/repo", false, &duplicates).is_err());
    }

    #[test]
    fn lfs_config_listing_pins_only_a_regular_unconflicted_blob() {
        let oid = "a".repeat(40);
        let index = format!("100644 {oid} 0\t.lfsconfig\0");
        let tree = format!("100644 blob {oid}\t.lfsconfig\0");
        assert_eq!(
            config_blob_from_listing(index.as_bytes(), Listing::Index).unwrap(),
            Some(oid.clone())
        );
        assert_eq!(
            config_blob_from_listing(tree.as_bytes(), Listing::Tree).unwrap(),
            Some(oid.clone())
        );
        assert!(
            config_blob_from_listing(b"", Listing::Index)
                .unwrap()
                .is_none()
        );
        assert!(
            config_blob_from_listing(b"", Listing::Tree)
                .unwrap()
                .is_none()
        );
        for record in [
            format!("120000 {oid} 0\t.lfsconfig\0"),
            format!("100644 {oid} 1\t.lfsconfig\0"),
            format!("100644 {oid} 0\tother\0"),
            format!("100644 {oid} 0\t.lfsconfig"),
            format!("{index}{index}"),
        ] {
            let error = config_blob_from_listing(record.as_bytes(), Listing::Index).unwrap_err();
            assert_eq!(error.to_string(), LFS_CONFIG_UNAVAILABLE);
        }
        assert!(
            config_blob_from_listing(
                format!("040000 tree {oid}\t.lfsconfig\0").as_bytes(),
                Listing::Tree
            )
            .is_err()
        );
        assert!(lfs_file_key_allowed("lfs.url"));
        assert!(lfs_file_key_allowed("lfs.pushurl"));
        assert!(lfs_file_key_allowed("remote.origin.lfsurl"));
        assert!(!lfs_file_key_allowed("remote.origin.lfspushurl"));
    }

    #[test]
    fn native_destination_output_has_unambiguous_line_boundaries() {
        assert_eq!(
            lines(b"https://github.com/owner/repo\n").unwrap(),
            vec!["https://github.com/owner/repo"]
        );
        for bytes in [
            b"".as_slice(),
            b"missing-terminator",
            b"one\n\n",
            b"private\rurl\n",
            b"private\0url\n",
        ] {
            assert!(lines(bytes).is_err());
        }
    }
}
