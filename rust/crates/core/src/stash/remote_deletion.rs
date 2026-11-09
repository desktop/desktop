//! Per-destination reviewed remote deletion using native Git transports and explicit leases.
use crate::{Repository, args, cancellation, discard_fs as work, process};
use anyhow::{Context, Result};
use cap_fs_ext::{FollowSymlinks, OpenOptionsFollowExt};
use cap_std::{
    ambient_authority,
    fs::{Dir, OpenOptions},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    ffi::OsString,
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

/// A remote branch and optional explicitly supplied expectations, one per push URL.
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct RemoteBranchDeletion {
    pub remote: String,
    pub branch: String,
    /// None queries the server; an array supplies complete OIDs (null means absent).
    pub expected: Option<Vec<Option<String>>>,
    #[serde(default)]
    pub fetch_backup: bool,
}
/// Optional upstream deletion derived from the selected local branch's Git configuration.
#[derive(Clone, Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct UpstreamDeletion {
    pub expected: Option<Vec<Option<String>>>,
    #[serde(default)]
    pub fetch_backup: bool,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Endpoint {
    raw: String,
    destination: String,
    explicit: bool,
    read_url: Option<String>,
    expected: Option<String>,
    available_locally: bool,
    backup_ref: String,
    phase: String,
    error: Option<String>,
    restored_as: Vec<String>,
}
#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(deny_unknown_fields)]
struct CachedRef {
    reference: String,
    oid: String,
}
pub(in crate::stash) struct Plan {
    pub(in crate::stash) view: Value,
    configuration: Vec<u8>,
    ignored_sections: Vec<String>,
    allow_submodules: bool,
    endpoints: Vec<Endpoint>,
    cached: Vec<CachedRef>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
struct Receipt {
    version: u8,
    id: String,
    repository_id: String,
    created_ns: u128,
    request: RemoteBranchDeletion,
    #[serde(default)]
    local_deletion_receipt_id: Option<String>,
    endpoints: Vec<Endpoint>,
    cached: Vec<CachedRef>,
    phase: String,
    error: Option<String>,
    warnings: Vec<String>,
}
pub(in crate::stash) struct Prepared {
    base: PathBuf,
    plan: Plan,
    receipt: Receipt,
}
fn project_configuration(bytes: &[u8], sections: &[String], submodules: bool) -> Result<Vec<u8>> {
    if sections.is_empty() && !submodules {
        return Ok(bytes.to_vec());
    }
    let fields = bytes
        .strip_suffix(b"\0")
        .unwrap_or(bytes)
        .split(|b| *b == 0)
        .collect::<Vec<_>>();
    anyhow::ensure!(
        fields.len().is_multiple_of(3),
        "Unexpected scoped Git configuration output"
    );
    let mut result = Vec::new();
    for row in fields.as_chunks::<3>().0 {
        let key = row[2].split(|b| *b == b'\n').next().unwrap_or_default();
        let section = key
            .iter()
            .rposition(|b| *b == b'.')
            .map(|at| &key[..at])
            .unwrap_or_default();
        if row[0] == b"local"
            && (sections.iter().any(|allowed| allowed.as_bytes() == section)
                || (submodules && section.starts_with(b"submodule.")))
        {
            continue;
        }
        for field in row {
            result.extend_from_slice(field);
            result.push(0);
        }
    }
    Ok(result)
}
impl Plan {
    pub(in crate::stash) fn allow_checkout_configuration(
        &mut self,
        sections: Vec<String>,
        submodules: bool,
    ) -> Result<()> {
        self.configuration = project_configuration(&self.configuration, &sections, submodules)?;
        self.ignored_sections = sections;
        self.allow_submodules = submodules;
        Ok(())
    }
}
fn identifier(id: &str) -> Result<()> {
    anyhow::ensure!(
        uuid::Uuid::parse_str(id)?.to_string() == id,
        "invalid remote deletion receipt ID"
    );
    Ok(())
}
fn directory(path: &Path, create: bool) -> Result<bool> {
    if create {
        let mut builder = fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(path)?;
    }
    match fs::symlink_metadata(path) {
        Err(e) if !create && e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.into()),
        Ok(m) => {
            anyhow::ensure!(
                m.is_dir() && !m.file_type().is_symlink(),
                "remote deletion directory must be a real directory"
            );
            Ok(true)
        }
    }
}
fn read(base: &Path, id: &str, owner: &str) -> Result<Receipt> {
    identifier(id)?;
    directory(base, false)?;
    let dir = Dir::open_ambient_dir(base, ambient_authority())?;
    let mut options = OpenOptions::new();
    options.read(true).follow(FollowSymlinks::No);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NONBLOCK);
    }
    let mut file = dir.open_with(format!("{id}.json"), &options)?;
    anyhow::ensure!(
        file.metadata()?.is_file(),
        "remote deletion receipt must be a regular file"
    );
    let mut bytes = Vec::new();
    file.by_ref()
        .take(1024 * 1024 + 1)
        .read_to_end(&mut bytes)?;
    anyhow::ensure!(
        bytes.len() <= 1024 * 1024,
        "remote deletion receipt exceeds supported size"
    );
    let r: Receipt = serde_json::from_slice(&bytes)?;
    anyhow::ensure!(
        r.version == 1 && r.id == id && r.repository_id == owner,
        "unsupported or foreign remote deletion receipt"
    );
    anyhow::ensure!(r.endpoints.len() <= 32, "too many recovery endpoints");
    if let Some(id) = &r.local_deletion_receipt_id {
        identifier(id)?;
    }
    for (i, e) in r.endpoints.iter().enumerate() {
        anyhow::ensure!(
            e.backup_ref == format!("refs/desktop/deleted-remotes/{id}/{i}"),
            "invalid remote recovery ref"
        );
        if let Some(oid) = &e.expected {
            super::oid(oid)?;
        }
    }
    Ok(r)
}
async fn write(base: &Path, r: &Receipt) -> Result<()> {
    let base = base.to_owned();
    let r = r.clone();
    tokio::task::spawn_blocking(move || -> Result<()> {
        directory(&base, false)?;
        let bytes = serde_json::to_vec_pretty(&r)?;
        anyhow::ensure!(
            bytes.len() <= 1024 * 1024,
            "remote deletion receipt exceeds supported size"
        );
        let tmp = base.join(format!(".{}.tmp", uuid::Uuid::new_v4()));
        work::private_write(&tmp, &bytes)?;
        let result = fs::rename(&tmp, base.join(format!("{}.json", r.id)));
        if result.is_err() {
            let _ = fs::remove_file(&tmp);
        }
        result?;
        #[cfg(unix)]
        fs::File::open(base)?.sync_all()?;
        Ok(())
    })
    .await?
}
// Never publish raw transport URLs: credentials can live in userinfo, paths,
// query strings, remote-helper commands, or local filesystem names.
fn endpoint_view(index: usize, e: &Endpoint) -> Value {
    json!({"index":index,"destination":format!("Push destination {}",index+1),"expected":e.expected,"available_locally":e.available_locally,"phase":e.phase,"error":e.error,"restored_as":e.restored_as})
}
fn clean_error(error: &str, endpoints: &[Endpoint]) -> String {
    let mut result = error.to_owned();
    let mut secrets = Vec::new();
    for e in endpoints {
        for url in [&e.raw, &e.destination]
            .into_iter()
            .chain(e.read_url.as_ref())
        {
            secrets.push(url.clone());
            if let Some((_, rest)) = url.split_once("://") {
                let authority = rest.split('/').next().unwrap_or(rest);
                if let Some((userinfo, _)) = authority.rsplit_once('@') {
                    secrets.push(userinfo.to_owned());
                    for part in userinfo.split(':') {
                        if !part.is_empty() {
                            secrets.push(part.to_owned());
                        }
                    }
                }
                if let Some((_, query)) = rest.split_once('?') {
                    secrets.push(query.to_owned());
                    for pair in query.split('&') {
                        if let Some((_, value)) = pair.split_once('=')
                            && !value.is_empty()
                        {
                            secrets.push(value.to_owned());
                        }
                    }
                }
            }
        }
    }
    secrets.sort_by_key(|s| std::cmp::Reverse(s.len()));
    secrets.dedup();
    for secret in secrets {
        if !secret.is_empty() {
            result = result.replace(&secret, "[transport]");
        }
    }
    result.chars().take(4096).collect()
}
fn scope(remote: &str, key: &str, value: &str) -> Vec<OsString> {
    args(&[
        "-c",
        &format!("remote.{remote}.{key}="),
        "-c",
        &format!("remote.{remote}.{key}={value}"),
    ])
}
fn push_scope(remote: &str, e: &Endpoint) -> Vec<OsString> {
    if e.explicit {
        scope(remote, "pushurl", &e.raw)
    } else {
        let mut a = scope(remote, "url", &e.raw);
        a.extend(args(&["-c", &format!("remote.{remote}.pushurl=")]));
        a
    }
}
fn map_ref(pattern: &str, value: &str, replacement: &str) -> Option<String> {
    if let Some((prefix, suffix)) = pattern.split_once('*') {
        if suffix.contains('*') {
            return None;
        }
        let middle = value.strip_prefix(prefix)?.strip_suffix(suffix)?;
        let (left, right) = replacement.split_once('*')?;
        if right.contains('*') {
            return None;
        }
        Some(format!("{left}{middle}{right}"))
    } else {
        (pattern == value).then(|| replacement.to_owned())
    }
}
fn matches_ref(pattern: &str, value: &str) -> bool {
    map_ref(pattern, value, if pattern.contains('*') { "*" } else { "" }).is_some()
}
impl Repository {
    async fn remote_deletion_directory(&self) -> Result<PathBuf> {
        Ok(self
            .git_directory()
            .await?
            .join("desktop-remote-branch-deletions"))
    }
    async fn remote_values(&self, key: &str) -> Result<Vec<String>> {
        let output = self
            .run(&args(&["config", "--null", "--get-all", key]))
            .await?;
        anyhow::ensure!(
            matches!(output.code, 0 | 1),
            "cannot inspect remote configuration"
        );
        if output.code == 1 {
            return Ok(Vec::new());
        }
        output
            .stdout
            .strip_suffix(b"\0")
            .unwrap_or(&output.stdout)
            .split(|b| *b == 0)
            .map(|v| Ok(std::str::from_utf8(v)?.to_owned()))
            .collect()
    }
    async fn remote_names(&self) -> Result<Vec<String>> {
        let output = self.run(&args(&["remote"])).await?;
        anyhow::ensure!(output.code == 0, "cannot list remotes");
        Ok(String::from_utf8(output.stdout)?
            .lines()
            .map(str::to_owned)
            .collect())
    }
    async fn remote_head_ref(&self, branch: &str) -> Result<String> {
        anyhow::ensure!(
            !branch.starts_with("refs/") || branch.starts_with("refs/heads/"),
            "expected a branch name or refs/heads reference"
        );
        let branch = branch.strip_prefix("refs/heads/").unwrap_or(branch);
        anyhow::ensure!(!branch.is_empty(), "expected a nonempty branch name");
        let reference = format!("refs/heads/{branch}");
        let output = self.run(&args(&["check-ref-format", &reference])).await?;
        anyhow::ensure!(output.code == 0, "invalid remote branch name");
        Ok(reference)
    }
    async fn remote_ref_oid(&self, reference: &str) -> Result<Option<String>> {
        let output = self
            .run(&args(&["show-ref", "--verify", "--hash", reference]))
            .await?;
        if output.code == 0 {
            let oid = String::from_utf8(output.stdout)?.trim().to_owned();
            super::oid(&oid)?;
            Ok(Some(oid))
        } else {
            let exists = self
                .run(&args(&["show-ref", "--verify", "--quiet", reference]))
                .await?;
            anyhow::ensure!(exists.code == 1, "cannot inspect remote recovery ref");
            Ok(None)
        }
    }
    async fn remote_direct_ref(&self, reference: &str) -> Result<bool> {
        let output = self
            .run(&args(&["symbolic-ref", "--quiet", reference]))
            .await?;
        anyhow::ensure!(
            matches!(output.code, 0 | 1),
            "cannot inspect symbolic remote ref"
        );
        Ok(output.code == 1)
    }
    async fn remote_cached(&self, remote: &str, reference: &str) -> Result<Vec<CachedRef>> {
        let specs = self
            .remote_values(&format!("remote.{remote}.fetch"))
            .await?;
        if specs
            .iter()
            .filter_map(|s| s.strip_prefix('^'))
            .any(|s| matches_ref(s, reference))
        {
            return Ok(Vec::new());
        }
        let mut refs = std::collections::BTreeSet::new();
        for spec in specs {
            let spec = spec.strip_prefix('+').unwrap_or(&spec);
            if let Some((source, destination)) = spec.split_once(':')
                && let Some(reference) = map_ref(source, reference, destination)
            {
                // A mirror/custom refspec must never turn cache cleanup into
                // local branch/tag/recovery deletion.
                if reference.starts_with("refs/")
                    && !reference.starts_with("refs/heads/")
                    && !reference.starts_with("refs/tags/")
                    && !reference.starts_with("refs/desktop/")
                {
                    refs.insert(reference);
                }
            }
        }
        let mut result = Vec::new();
        for reference in refs {
            if self.remote_direct_ref(&reference).await?
                && let Some(oid) = self.remote_ref_oid(&reference).await?
            {
                result.push(CachedRef { reference, oid });
            }
        }
        Ok(result)
    }
    pub(crate) async fn remote_deletion_targets(&self) -> Result<Value> {
        let remotes = self.remote_names().await?;
        let output = self
            .run(&args(&[
                "for-each-ref",
                "--format=%(refname)%00%(upstream:remotename)%00%(upstream:remoteref)",
                "refs/heads/",
            ]))
            .await?;
        anyhow::ensure!(output.code == 0, "cannot inspect branch upstreams");
        let mut upstreams = Vec::new();
        for row in output
            .stdout
            .split(|b| *b == b'\n')
            .filter(|r| !r.is_empty())
        {
            let fields = row.split(|b| *b == 0).collect::<Vec<_>>();
            if fields.len() == 3 && !fields[1].is_empty() && fields[1] != b"." {
                upstreams.push(json!({"local_ref":std::str::from_utf8(fields[0])?,"remote":std::str::from_utf8(fields[1])?,"branch":std::str::from_utf8(fields[2])?}));
            }
        }
        Ok(json!({"remotes":remotes,"upstreams":upstreams}))
    }
    async fn remote_read_url(&self, remote: &str, e: &Endpoint) -> Result<Option<String>> {
        let mut candidates = vec![e.raw.clone(), e.destination.clone()];
        // Invert insteadOf candidates, then let native Git decide. This avoids
        // applying chained rewrites twice when the push URL is already expanded.
        let rules = self
            .run(&args(&[
                "config",
                "--null",
                "--get-regexp",
                "^url\\..*\\.insteadof$",
            ]))
            .await?;
        anyhow::ensure!(matches!(rules.code, 0 | 1), "cannot inspect URL rewriting");
        for row in rules.stdout.split(|b| *b == 0).filter(|r| !r.is_empty()) {
            if let Some(at) = row.iter().position(|b| *b == b'\n') {
                let key = std::str::from_utf8(&row[..at])?;
                let value = std::str::from_utf8(&row[at + 1..])?;
                if let Some(base) = key
                    .strip_prefix("url.")
                    .and_then(|s| s.strip_suffix(".insteadof"))
                    && let Some(suffix) = e.destination.strip_prefix(base)
                {
                    candidates.push(format!("{value}{suffix}"));
                }
            }
        }
        anyhow::ensure!(candidates.len() <= 128, "too many URL rewrite candidates");
        for candidate in candidates {
            let mut command = scope(remote, "url", &candidate);
            command.extend(args(&["ls-remote", "--get-url", "--", remote]));
            let output = process::run_checkout(&self.path, &command).await?;
            if output.code == 0
                && output.stdout.strip_suffix(b"\n") == Some(e.destination.as_bytes())
            {
                return Ok(Some(candidate));
            }
        }
        Ok(None)
    }
    async fn remote_query(
        &self,
        remote: &str,
        reference: &str,
        e: &Endpoint,
    ) -> Result<Option<String>> {
        let read = e.read_url.as_deref().context(
            "Cannot resolve the push destination for reading; supply explicit expected IDs instead",
        )?;
        let mut command = scope(remote, "url", read);
        command.extend(args(&[
            "ls-remote",
            "--heads",
            "--refs",
            "--exit-code",
            "--",
            remote,
            reference,
        ]));
        let output = process::run_checkout(&self.path, &command).await?;
        if output.code == 2 {
            return Ok(None);
        }
        anyhow::ensure!(
            output.code == 0,
            "Cannot read push destination: {}",
            clean_error(
                &String::from_utf8_lossy(&output.stderr),
                std::slice::from_ref(e)
            )
        );
        for row in output
            .stdout
            .split(|b| *b == b'\n')
            .filter(|r| !r.is_empty())
        {
            if let Some(at) = row.iter().position(|b| *b == b'\t')
                && row[at + 1..] == *reference.as_bytes()
            {
                let oid = std::str::from_utf8(&row[..at])?;
                super::oid(oid)?;
                return Ok(Some(oid.to_ascii_lowercase()));
            }
        }
        // ls-remote patterns can also match suffixes of longer reference names.
        // Only the exact canonical head is the selected branch.
        Ok(None)
    }
    pub(in crate::stash) async fn remote_deletion_plan(
        &self,
        request: &RemoteBranchDeletion,
    ) -> Result<Plan> {
        anyhow::ensure!(
            self.remote_names().await?.contains(&request.remote),
            "Select a configured remote name"
        );
        let reference = self.remote_head_ref(&request.branch).await?;
        let configuration = self.remote_deletion_configuration().await?;
        let mut raw = self
            .remote_values(&format!("remote.{}.pushurl", request.remote))
            .await?;
        if let Some(at) = raw.iter().rposition(String::is_empty) {
            raw.drain(..=at);
        }
        let explicit = !raw.is_empty();
        if !explicit {
            raw = self
                .remote_values(&format!("remote.{}.url", request.remote))
                .await?;
            if let Some(at) = raw.iter().rposition(String::is_empty) {
                raw.drain(..=at);
            }
        }
        anyhow::ensure!(
            !raw.is_empty() && raw.len() <= 32,
            "Remote must have between 1 and 32 push destinations"
        );
        if let Some(expected) = &request.expected {
            anyhow::ensure!(
                expected.len() == raw.len(),
                "Supply exactly one expected ID per push destination"
            );
            for oid in expected.iter().flatten() {
                super::oid(oid)?;
                anyhow::ensure!(
                    !oid.bytes().all(|b| b == b'0'),
                    "Use null/missing for an absent remote branch"
                );
            }
        }
        let mut endpoints = Vec::new();
        for (i, raw) in raw.into_iter().enumerate() {
            anyhow::ensure!(
                !raw.contains(['\r', '\n', '\0']),
                "Remote URL contains unsupported line delimiters"
            );
            let mut endpoint = Endpoint {
                raw,
                destination: String::new(),
                explicit,
                read_url: None,
                expected: None,
                available_locally: false,
                backup_ref: String::new(),
                phase: "pending".into(),
                error: None,
                restored_as: Vec::new(),
            };
            let mut command = push_scope(&request.remote, &endpoint);
            command.extend(args(&[
                "remote",
                "get-url",
                "--push",
                "--all",
                &request.remote,
            ]));
            let output = process::run_checkout(&self.path, &command).await?;
            anyhow::ensure!(output.code == 0, "Cannot resolve push destination");
            let destination = String::from_utf8(output.stdout)?;
            let destination = destination
                .strip_suffix('\n')
                .context("invalid push destination output")?;
            anyhow::ensure!(
                !destination.is_empty() && !destination.contains(['\r', '\n', '\0']),
                "Cannot isolate one push destination with this native Git version"
            );
            endpoint.destination = destination.into();
            endpoint.read_url = self.remote_read_url(&request.remote, &endpoint).await?;
            endpoint.expected = if let Some(expected) = &request.expected {
                expected[i].as_ref().map(|oid| oid.to_ascii_lowercase())
            } else {
                self.remote_query(&request.remote, &reference, &endpoint)
                    .await?
            };
            if let Some(oid) = &endpoint.expected {
                endpoint.available_locally =
                    process::local_commit_available(&self.path, oid).await?;
            }
            if request.fetch_backup && endpoint.expected.is_some() {
                anyhow::ensure!(
                    endpoint.read_url.is_some(),
                    "Cannot read this push destination to retain its tip"
                );
            }
            for previous in &endpoints {
                let previous: &Endpoint = previous;
                if previous.destination == endpoint.destination {
                    anyhow::ensure!(
                        previous.expected == endpoint.expected,
                        "The same push destination has different expectations; review again"
                    );
                }
            }
            endpoints.push(endpoint);
        }
        let cached = self.remote_cached(&request.remote, &reference).await?;
        let context = json!({"repository":self.id(),"request":request,"reference":reference,"configuration":configuration,"endpoints":endpoints,"cached":cached});
        let basis = format!("{:x}", Sha256::digest(serde_json::to_vec(&context)?));
        let view = json!({"basis":basis,"remote":request.remote,"reference":reference,"supplied_expectations":request.expected.is_some(),"fetch_backup":request.fetch_backup,"endpoints":endpoints.iter().enumerate().map(|(i,e)|endpoint_view(i,e)).collect::<Vec<_>>(),"cached_refs":cached});
        Ok(Plan {
            view,
            configuration,
            ignored_sections: Vec::new(),
            allow_submodules: false,
            endpoints,
            cached,
        })
    }
    pub(crate) async fn remote_branch_delete_preview(
        &self,
        request: RemoteBranchDeletion,
    ) -> Result<Value> {
        Ok(self.remote_deletion_plan(&request).await?.view)
    }
    async fn remote_deletion_configuration(&self) -> Result<Vec<u8>> {
        let output = crate::process::configuration(
            &self.path,
            &args(&[
                "config",
                "--null",
                "--list",
                "--includes",
                "--show-origin",
                "--show-scope",
            ]),
        )
        .await?;
        anyhow::ensure!(output.code == 0, "Cannot read scoped Git configuration");
        Ok(output.stdout)
    }
    async fn remote_check_configuration(&self, plan: &Plan) -> Result<()> {
        anyhow::ensure!(
            project_configuration(
                &self.remote_deletion_configuration().await?,
                &plan.ignored_sections,
                plan.allow_submodules
            )? == plan.configuration,
            "Git configuration changed; review remote deletion again"
        );
        Ok(())
    }
    async fn remote_push_hooks(&self, base: &Path, receipt: &Receipt) -> Result<Vec<OsString>> {
        let guard = base.join(format!("{}.hooks", receipt.id));
        directory(&guard, true)?;
        let output = self
            .run(&args(&[
                "rev-parse",
                "--path-format=absolute",
                "--git-path",
                "hooks",
            ]))
            .await?;
        anyhow::ensure!(output.code == 0, "Cannot resolve native hooks directory");
        let original = output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout);
        let shell = self.run(&args(&["var", "GIT_SHELL_PATH"])).await?;
        anyhow::ensure!(shell.code == 0, "Cannot resolve native Git shell");
        let shell = shell.stdout.strip_suffix(b"\n").unwrap_or(&shell.stdout);
        #[cfg(not(windows))]
        anyhow::ensure!(
            !shell.is_empty() && !shell.iter().any(u8::is_ascii_whitespace),
            "Unsupported Git hook shell path"
        );
        fn quote(bytes: &[u8]) -> Vec<u8> {
            let mut q = vec![b'\''];
            for b in bytes {
                if *b == b'\'' {
                    q.extend_from_slice(b"'\\''");
                } else {
                    q.push(*b);
                }
            }
            q.push(b'\'');
            q
        }
        let overrides = self
            .deletion_hook_overrides(&[b"pre-push", b"reference-transaction"])
            .await?;
        let mut outer = args(&["-c"]);
        let mut hooks = OsString::from("core.hooksPath=");
        hooks.push(&guard);
        outer.push(hooks);
        for (key, _) in &overrides {
            let mut value = key.clone();
            value.extend_from_slice(
                if key == b"hook.reference-transaction.enabled" || key == b"hook.pre-push.enabled" {
                    b"=true"
                } else {
                    b"=false"
                },
            );
            outer.push("-c".into());
            outer.push(crate::os_from_bytes(&value)?);
        }
        for event in ["reference-transaction", "pre-push"] {
            let mut script = b"#!".to_vec();
            #[cfg(windows)]
            script.extend_from_slice(b"/bin/sh");
            #[cfg(not(windows))]
            script.extend_from_slice(shell);
            script.extend_from_slice(b"\ninput=");
            script.extend(quote(
                guard
                    .join(event)
                    .with_extension("input")
                    .as_os_str()
                    .as_encoded_bytes(),
            ));
            script
                .extend_from_slice(b".$$\ntrap 'rm -f \"$input\"' 0\ncat >\"$input\" || exit 1\n");
            if event == "reference-transaction" {
                // A push owns server refs, never local cache refs. Reject its local
                // automatic transaction; Git reports that local failure separately.
                script.extend_from_slice(b"if [ \"$1\" = prepared ]; then\n echo 'Desktop retains local refs until all push destinations finish' >&2\n exit 1\nfi\nexit 0\n");
            }
            script.extend_from_slice(b"git -c ");
            let mut original_setting = b"core.hooksPath=".to_vec();
            original_setting.extend_from_slice(original);
            script.extend(quote(&original_setting));
            for (key, enabled) in &overrides {
                script.extend_from_slice(b" -c ");
                let mut setting = key.clone();
                setting.extend_from_slice(if *enabled { b"=true" } else { b"=false" });
                script.extend(quote(&setting));
            }
            script.extend_from_slice(b" hook run --ignore-missing --to-stdin=\"$input\" ");
            script.extend(quote(event.as_bytes()));
            script.extend_from_slice(b" -- \"$@\"\n");
            let file = guard.join(event);
            work::private_write(&file, &script)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(file, fs::Permissions::from_mode(0o700))?;
            }
        }
        Ok(outer)
    }
    pub(crate) async fn delete_remote_branch(
        &self,
        request: RemoteBranchDeletion,
        basis: Option<&str>,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let plan = self.remote_deletion_plan(&request).await?;
        if let Some(basis) = basis {
            anyhow::ensure!(
                plan.view["basis"] == basis,
                "Remote branch deletion context changed; review again"
            );
        }
        let prepared = self
            .prepare_remote_deletion(request, plan, uuid::Uuid::new_v4().to_string(), None)
            .await?;
        self.execute_remote_deletion(prepared).await
    }
    async fn remote_deletion_error(
        &self,
        base: &Path,
        receipt: &mut Receipt,
        error: anyhow::Error,
    ) -> Result<anyhow::Error> {
        let message = clean_error(&error.to_string(), &receipt.endpoints);
        receipt.error = Some(message.clone());
        write(base, receipt).await?;
        Ok(anyhow::anyhow!(
            "Remote deletion {} stopped during {}: {message}. Inspect remote-deletion-history before retrying",
            receipt.id,
            receipt.phase
        ))
    }
    pub(in crate::stash) async fn prepare_remote_deletion(
        &self,
        request: RemoteBranchDeletion,
        plan: Plan,
        id: String,
        local_deletion_receipt_id: Option<String>,
    ) -> Result<Prepared> {
        let base = self.remote_deletion_directory().await?;
        directory(&base, true)?;
        let reference = self.remote_head_ref(&request.branch).await?;
        let mut receipt = Receipt {
            version: 1,
            id: id.clone(),
            repository_id: self.id(),
            created_ns: SystemTime::now().duration_since(UNIX_EPOCH)?.as_nanos(),
            request: request.clone(),
            local_deletion_receipt_id,
            endpoints: plan.endpoints.clone(),
            cached: plan.cached.clone(),
            phase: "prepared".into(),
            error: None,
            warnings: Vec::new(),
        };
        for (i, e) in receipt.endpoints.iter_mut().enumerate() {
            e.backup_ref = format!("refs/desktop/deleted-remotes/{id}/{i}");
        }
        write(&base, &receipt).await?;
        let result:Result<()>=async {
            self.remote_check_configuration(&plan).await?;
            receipt.phase="backing_up".into();write(&base,&receipt).await?;
            // Prepare every available/explicitly requested backup before the first push.
            for i in 0..receipt.endpoints.len() {
                let e=&receipt.endpoints[i];let Some(oid)=&e.expected else {continue;};
                let present=process::local_commit_available(&self.path,oid).await?;
                anyhow::ensure!(!e.available_locally||present||request.fetch_backup,"Reviewed local recovery tip is no longer available; enable fetch backup and review again");
                if request.fetch_backup&&!present {
                    let mut command=scope(&request.remote,"url",e.read_url.as_deref().context("missing read URL")?);
                    command.extend(args(&["fetch","--no-tags","--no-prune","--no-write-fetch-head","--no-recurse-submodules","--no-auto-maintenance","--refmap=","--",&request.remote,&format!("{reference}:{}",e.backup_ref)]));
                    let output=process::run_checkout(&self.path,&command).await?;
                    anyhow::ensure!(output.code==0,"Cannot fetch recovery tip: {}",clean_error(&String::from_utf8_lossy(&output.stderr),&receipt.endpoints));
                    anyhow::ensure!(self.remote_ref_oid(&e.backup_ref).await?.as_deref()==Some(oid),"Remote tip changed while fetching recovery data; no remote deletion was attempted");
                } else if present {
                    let output=process::run_checkout(&self.path,&args(&["update-ref","--no-deref","--create-reflog","-m",&format!("Desktop remote branch deletion {id}"),&e.backup_ref,oid,&"0".repeat(oid.len())])).await?;
                    anyhow::ensure!(output.code==0,"Cannot retain remote branch tip");
                } else {receipt.warnings.push(format!("Destination {}: tip is not available locally; enable fetch backup before deletion to retain it",i+1));}
                write(&base,&receipt).await?;
            }
            receipt.phase="backed_up".into();write(&base,&receipt).await?;Ok(())
        }.await;
        if let Err(error) = result {
            return Err(self
                .remote_deletion_error(&base, &mut receipt, error)
                .await?);
        }
        Ok(Prepared {
            base,
            plan,
            receipt,
        })
    }
    pub(in crate::stash) async fn stop_prepared_remote_deletion(
        &self,
        prepared: &mut Prepared,
        error: &str,
    ) -> Result<()> {
        prepared.receipt.phase = "local_deletion_stopped".into();
        prepared.receipt.error = Some(clean_error(error, &prepared.receipt.endpoints));
        write(&prepared.base, &prepared.receipt).await
    }
    pub(in crate::stash) async fn execute_remote_deletion(
        &self,
        prepared: Prepared,
    ) -> Result<Value> {
        let Prepared {
            base,
            plan,
            mut receipt,
        } = prepared;
        let id = receipt.id.clone();
        let request = receipt.request.clone();
        let result:Result<Value>=async {
            let reference = self.remote_head_ref(&request.branch).await?;
            let hook_scope=self.remote_push_hooks(&base,&receipt).await?;
            receipt.phase="pushing".into();write(&base,&receipt).await?;
            for i in 0..receipt.endpoints.len() {
                self.remote_check_configuration(&plan).await?;
                cancellation::Cancellation::current().check()?;
                if receipt.endpoints[..i].iter().any(|previous|previous.destination==receipt.endpoints[i].destination&&matches!(previous.phase.as_str(),"deleted"|"already_missing"|"duplicate_destination")) {receipt.endpoints[i].phase="duplicate_destination".into();write(&base,&receipt).await?;continue;}
                if receipt.endpoints[i].expected.is_none()&&request.expected.is_none() {receipt.endpoints[i].phase="already_missing".into();write(&base,&receipt).await?;continue;}
                receipt.endpoints[i].phase="pushing".into();write(&base,&receipt).await?;
                let e=&receipt.endpoints[i];let mut command=push_scope(&request.remote,e);
                command.extend(hook_scope.clone());
                command.extend(args(&["-c",&format!("remote.{}.mirror=false",request.remote)]));
                command.extend(args(&["push","--porcelain","--no-mirror","--no-follow-tags","--recurse-submodules=no","--no-force-if-includes",&format!("--force-with-lease={reference}:{}",e.expected.as_deref().unwrap_or("")),"--",&request.remote,&format!(":{reference}")]));
                let output=process::run_checkout(&self.path,&command).await?;
                // Native Git prints the server acknowledgement before updating local
                // tracking refs. Our guard deliberately rejects that latter transaction,
                // which may give push a nonzero exit after a successful server deletion.
                let acknowledged=String::from_utf8_lossy(&output.stdout).lines().any(|line| {
                    let fields=line.split('\t').collect::<Vec<_>>();
                    fields.len()==3&&(fields[0]=="-"||fields[0]=="=")&&fields[1]==format!(":{reference}")
                });
                if !acknowledged {let message=clean_error(&format!("{}{}",String::from_utf8_lossy(&output.stderr),String::from_utf8_lossy(&output.stdout)),&receipt.endpoints);receipt.endpoints[i].error=Some(message.clone());
                    let refused=String::from_utf8_lossy(&output.stdout).lines().any(|line|line.starts_with("!\t"));
                    receipt.endpoints[i].phase=if refused {"failed"}else{"unconfirmed"}.into();anyhow::bail!("Remote deletion was not acknowledged at destination {}: {message}",i+1);}
                if output.code!=0&&!String::from_utf8_lossy(&output.stderr).contains("Desktop retains local refs until all push destinations finish") {receipt.warnings.push(format!("Destination {} acknowledged deletion but native Git reported a later local error",i+1));}
                receipt.endpoints[i].phase="deleted".into();write(&base,&receipt).await?;
            }
            receipt.phase="pruning_cache".into();write(&base,&receipt).await?;
            for cached in &receipt.cached {
                if !self.remote_direct_ref(&cached.reference).await? {receipt.warnings.push(format!("Retained changed symbolic cache ref {}",cached.reference));continue;}
                let current=self.remote_ref_oid(&cached.reference).await?;
                if current.is_none(){continue;}
                if current.as_deref()!=Some(&cached.oid){receipt.warnings.push(format!("Retained changed cache ref {}",cached.reference));continue;}
                let output=process::run_checkout(&self.path,&args(&["update-ref","--no-deref","-d",&cached.reference,&cached.oid])).await?;
                if output.code!=0 {receipt.warnings.push(format!("Could not prune cache ref {}",cached.reference));}
            }
            receipt.phase="complete".into();write(&base,&receipt).await?;
            Ok(json!({"code":0,"stdout":"Remote branch deletion completed","stderr":"","receipt_id":id,"warnings":receipt.warnings}))
        }.await;
        match result {
            Ok(value) => Ok(value),
            Err(error) => Err(self
                .remote_deletion_error(&base, &mut receipt, error)
                .await?),
        }
    }
    pub(crate) async fn remote_deletion_history(&self) -> Result<Value> {
        let base = self.remote_deletion_directory().await?;
        if !directory(&base, false)? {
            return Ok(json!([]));
        }
        let mut records = Vec::new();
        for entry in fs::read_dir(&base)? {
            let filename = entry?.file_name().to_string_lossy().into_owned();
            let Some(id) = filename.strip_suffix(".json") else {
                continue;
            };
            if identifier(id).is_err() {
                continue;
            }
            anyhow::ensure!(
                records.len() < 1000,
                "remote deletion history exceeds 1000 records; forget old recovery records"
            );
            let result:Result<Value>=async {
                let r=read(&base,id,&self.id())?;let mut endpoints=Vec::new();
                for (i,e) in r.endpoints.iter().enumerate() {let mut value=endpoint_view(i,e);value["backup_ref"]=json!(e.backup_ref);value["backup_oid"]=json!(self.remote_ref_oid(&e.backup_ref).await?);value["backup_direct"]=json!(self.remote_direct_ref(&e.backup_ref).await?);endpoints.push(value);}
                Ok(json!({"id":r.id,"remote":r.request.remote,"reference":self.remote_head_ref(&r.request.branch).await?,"created_ns":r.created_ns,"local_deletion_receipt_id":r.local_deletion_receipt_id,"phase":r.phase,"error":r.error,"warnings":r.warnings,"endpoints":endpoints}))
            }.await;
            records.push(match result {Ok(value)=>value,Err(_)=>json!({"id":id,"error":"Cannot read this remote deletion receipt; inspect its private metadata"})});
        }
        records.sort_by(|a, b| b["created_ns"].as_u64().cmp(&a["created_ns"].as_u64()));
        Ok(json!(records))
    }
    pub(crate) async fn restore_remote_tip(
        &self,
        id: &str,
        index: usize,
        name: &str,
    ) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.remote_deletion_directory().await?;
        let mut r = read(&base, id, &self.id())?;
        let e = r
            .endpoints
            .get(index)
            .context("invalid push destination index")?;
        let oid = e
            .expected
            .as_deref()
            .context("No remote tip was recorded for this destination")?;
        anyhow::ensure!(
            self.remote_direct_ref(&e.backup_ref).await?
                && self.remote_ref_oid(&e.backup_ref).await?.as_deref() == Some(oid),
            "Recovery ref changed or is unavailable"
        );
        let reference = self.remote_head_ref(name).await?;
        anyhow::ensure!(
            self.remote_ref_oid(&reference).await?.is_none(),
            "Local branch already exists"
        );
        let name = reference
            .strip_prefix("refs/heads/")
            .context("invalid local branch")?;
        anyhow::ensure!(
            !self.branch_has_settings(name).await?,
            "Local branch settings already exist; choose another restore name"
        );
        // Create a direct absent ref without automatic tracking or index changes.
        r.phase = "restoring_local_tip".into();
        write(&base, &r).await?;
        let output = self.restore_branch_ref(name, oid).await?;
        anyhow::ensure!(
            output.code == 0,
            "Cannot restore local branch: {}",
            clean_error(&String::from_utf8_lossy(&output.stderr), &r.endpoints)
        );
        r.endpoints[index].restored_as.push(name.into());
        r.phase = "local_tip_restored".into();
        write(&base, &r).await?;
        Ok(json!({"code":0,"stdout":"Remote tip restored as a local branch","stderr":""}))
    }
    pub(crate) async fn forget_remote_deletion(&self, id: &str) -> Result<Value> {
        let _lock = self.stash_lock().await?;
        let base = self.remote_deletion_directory().await?;
        let mut r = read(&base, id, &self.id())?;
        for e in &r.endpoints {
            if let Some(current) = self.remote_ref_oid(&e.backup_ref).await? {
                anyhow::ensure!(
                    self.remote_direct_ref(&e.backup_ref).await?
                        && e.expected.as_deref() == Some(&current),
                    "Recovery ref changed; inspect it before forgetting"
                );
            }
        }
        r.phase = "forgetting".into();
        write(&base, &r).await?;
        for e in &r.endpoints {
            if let Some(oid) = &e.expected
                && self.remote_ref_oid(&e.backup_ref).await?.is_some()
            {
                let output = process::run_checkout(
                    &self.path,
                    &args(&["update-ref", "--no-deref", "-d", &e.backup_ref, oid]),
                )
                .await?;
                anyhow::ensure!(output.code == 0, "Cannot remove remote recovery ref");
            }
        }
        let hooks = base.join(format!("{id}.hooks"));
        if directory(&hooks, false)? {
            fs::remove_dir_all(hooks)?;
        }
        fs::remove_file(base.join(format!("{id}.json")))?;
        Ok(json!({"code":0,"stdout":"Remote deletion recovery forgotten","stderr":""}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn custom_fetch_mapping() {
        assert_eq!(
            map_ref("refs/heads/*", "refs/heads/topic/x", "refs/cache/*"),
            Some("refs/cache/topic/x".into())
        );
        assert!(matches_ref("refs/heads/private/*", "refs/heads/private/x"));
        assert!(!matches_ref("refs/heads/private/*", "refs/heads/public/x"));
    }
    #[test]
    fn urls_never_escape_failure() {
        let e = Endpoint {
            raw: "https://user:secret@host/path?token=abc123".into(),
            destination: "https://user:secret@host/path?token=abc123".into(),
            explicit: true,
            read_url: None,
            expected: None,
            available_locally: false,
            backup_ref: String::new(),
            phase: "pending".into(),
            error: None,
            restored_as: Vec::new(),
        };
        let cleaned = clean_error(
            "failed https://user:secret@host/path?token=abc123 password secret token abc123",
            &[e],
        );
        assert!(
            !cleaned.contains("secret") && !cleaned.contains("abc123") && !cleaned.contains("user")
        );
    }
}
