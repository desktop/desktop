use crate::CommandOutput;
use anyhow::{Context, Result};
use std::{ffi::OsString, path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    process::Command,
};

pub struct RawOutput {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

impl RawOutput {
    pub fn text(self) -> CommandOutput {
        CommandOutput {
            code: self.code,
            stdout: String::from_utf8_lossy(&self.stdout).into_owned(),
            stderr: String::from_utf8_lossy(&self.stderr).into_owned(),
        }
    }
}

pub async fn run(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    run_git(path, args, None, None).await
}

pub(crate) async fn configuration(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    crate::git_credentials::native_configuration(run(path, args)).await
}

pub async fn run_git(
    path: &Path,
    args: &[OsString],
    input: Option<Vec<u8>>,
    index: Option<&Path>,
) -> Result<RawOutput> {
    let command = git_command(index);
    run_command(path, command, args, input, 2 * 1024 * 1024, None).await
}

/// Parse supplied config bytes without discovering a repository or loading user configuration.
#[cfg(unix)]
pub(crate) async fn parse_git_config(bytes: Vec<u8>) -> Result<RawOutput> {
    let mut command = Command::new("git");
    command
        .env("GIT_DIR", "/dev/null")
        .env("GIT_CONFIG_GLOBAL", "/dev/null")
        .env("GIT_CONFIG_SYSTEM", "/dev/null")
        .env("GIT_CONFIG_NOSYSTEM", "1")
        .env("GIT_CONFIG_COUNT", "0")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_COMMON_DIR")
        .env_remove("GIT_CONFIG")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env("GIT_TERMINAL_PROMPT", "0");
    run_command(
        &std::env::temp_dir(),
        command,
        &crate::args(&["config", "--file", "-", "--no-includes", "--null", "--list"]),
        Some(bytes),
        2 * 1024 * 1024,
        None,
    )
    .await
}
#[cfg(not(unix))]
pub(crate) async fn parse_git_config(_: Vec<u8>) -> Result<RawOutput> {
    anyhow::bail!("Git configuration cannot be verified on this platform")
}

/// Typed commits contain message options, never pathspec operands. Do not leak
/// our direct-file literal mode into user hooks or Git LFS post-commit hooks.
pub async fn run_commit(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    run_command(
        path,
        git_native_paths(None),
        args,
        None,
        2 * 1024 * 1024,
        None,
    )
    .await
}

/// Inspect only existing objects; a partial clone must not fetch implicitly.
pub async fn local_commit_available(path: &Path, oid: &str) -> Result<bool> {
    let mut command = git_command(None);
    command.env("GIT_NO_LAZY_FETCH", "1");
    let output = run_command(
        path,
        command,
        &crate::args(&["cat-file", "-e", &format!("{oid}^{{commit}}")]),
        None,
        2 * 1024 * 1024,
        None,
    )
    .await?;
    Ok(output.code == 0)
}

/// Stash commands own their native pathspecs and may invoke LFS internally.
pub async fn run_stash(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    run_command(
        path,
        git_native_paths(None),
        args,
        None,
        2 * 1024 * 1024,
        None,
    )
    .await
}

/// Branch switches and their hooks use native path semantics. Fix diagnostic
/// locale so local-overwrite refusal is distinguishable from other failures.
pub async fn run_checkout(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    let mut command = git_native_paths(None);
    command.env("LC_ALL", "C");
    run_command(path, command, args, None, 2 * 1024 * 1024, None).await
}

/// Run Git's conflict-marker diagnostic with a stable locale and an alternate index.
pub async fn conflict_markers(
    path: &Path,
    args: &[OsString],
    index: Option<&Path>,
) -> Result<RawOutput> {
    let mut command = git_command(index);
    command.env("LC_ALL", "C");
    run_command(path, command, args, None, 2 * 1024 * 1024, None).await
}

/// LFS queries must not implicitly install hooks while inspecting attributes.
pub async fn run_lfs(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    // git-lfs uses Git's :(attr:filter=lfs) pathspec internally on newer Git.
    // Literal-path settings belong to our direct Git calls, not its children.
    let mut command = git_native_paths(None);
    command.env("GIT_LFS_TRACK_NO_INSTALL_HOOKS", "1");
    run_command(path, command, args, None, 2 * 1024 * 1024, None).await
}

fn git_native_paths(index: Option<&Path>) -> Command {
    let mut command = git_base(index);
    command
        .env_remove("GIT_LITERAL_PATHSPECS")
        .env_remove("GIT_GLOB_PATHSPECS")
        .env_remove("GIT_NOGLOB_PATHSPECS")
        .env_remove("GIT_ICASE_PATHSPECS");
    command
}

fn git_command(index: Option<&Path>) -> Command {
    let mut command = git_base(index);
    command.arg("--literal-pathspecs");
    command
}

fn git_base(index: Option<&Path>) -> Command {
    let mut command = Command::new("git");
    command
        .args(["--no-pager", "-c", "color.ui=false"])
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("GIT_SEQUENCE_EDITOR", "true")
        .env("GIT_OPTIONAL_LOCKS", "0");
    crate::git_credentials::apply(&mut command);
    // Keep user/credential policy out of persisted guard scripts. Native Git
    // appends command-line hook overrides to PARAMETERS after this snapshot.
    if let Some(parameters) = crate::git_credentials::inherited_parameters() {
        command
            .env("DESKTOP_RS_GIT_BASE_PARAMETERS_PRESENT", "1")
            .env("DESKTOP_RS_GIT_BASE_PARAMETERS", parameters);
    } else {
        command
            .env("DESKTOP_RS_GIT_BASE_PARAMETERS_PRESENT", "0")
            .env_remove("DESKTOP_RS_GIT_BASE_PARAMETERS");
    }
    if let Some(index) = index {
        command.env("GIT_INDEX_FILE", index);
    }
    command
}

/// Stream checkout-filter output without imposing the UI preview limit.
pub async fn git_to_file(path: &Path, args: &[OsString], output: &Path) -> Result<RawOutput> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options.open(output)?;
    run_command(
        path,
        git_command(None),
        args,
        None,
        0,
        Some(tokio::fs::File::from_std(file)),
    )
    .await
}

pub async fn run_gh(path: &Path, args: &[OsString], input: Option<Vec<u8>>) -> Result<RawOutput> {
    let mut command = Command::new("gh");
    command
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("NO_COLOR", "1");
    run_command(path, command, args, input, 2 * 1024 * 1024, None).await
}

/// Private API sessions capture credentials and responses without debug logging.
/// A supplied token is pinned in every gh credential environment variable; it
/// never appears in arguments or in this module's command diagnostics.
pub(crate) async fn run_gh_private(
    path: &Path,
    args: &[OsString],
    token: Option<&str>,
) -> Result<RawOutput> {
    run_gh_private_input(path, args, None, token).await
}

pub(crate) async fn run_gh_private_input(
    path: &Path,
    args: &[OsString],
    input: Option<Vec<u8>>,
    token: Option<&str>,
) -> Result<RawOutput> {
    run_command(
        path,
        private_gh_command(token),
        args,
        input,
        2 * 1024 * 1024,
        None,
    )
    .await
}

/// Inspect explicitly stored gh accounts without environment-token overrides.
pub(crate) async fn run_gh_stored(path: &Path, args: &[OsString]) -> Result<RawOutput> {
    run_command(path, stored_gh_command(), args, None, 2 * 1024 * 1024, None).await
}

fn stored_gh_command() -> Command {
    let mut command = private_gh_command(None);
    for variable in [
        "GH_TOKEN",
        "GITHUB_TOKEN",
        "GH_ENTERPRISE_TOKEN",
        "GITHUB_ENTERPRISE_TOKEN",
    ] {
        command.env_remove(variable);
    }
    command
}

fn private_gh_command(token: Option<&str>) -> Command {
    let mut command = Command::new("gh");
    command
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_PAGER", "cat")
        .env("NO_COLOR", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .env("GH_NO_EXTENSION_UPDATE_NOTIFIER", "1")
        .env_remove("GH_DEBUG")
        .env_remove("DEBUG")
        .env_remove("GH_REPO")
        .env_remove("GH_HOST");
    crate::git_credentials::apply(&mut command);
    if let Some(token) = token {
        for variable in [
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GH_ENTERPRISE_TOKEN",
            "GITHUB_ENTERPRISE_TOKEN",
        ] {
            command.env(variable, token);
        }
    }
    command
}

/// Compare captured bytes with enough output budget for line-prefix overhead.
pub async fn diff_files(path: &Path, before: &Path, after: &Path) -> Result<RawOutput> {
    let mut command = Command::new("git");
    command.arg("--no-pager").env("GIT_OPTIONAL_LOCKS", "0");
    let mut args = crate::args(&[
        "diff",
        "--no-index",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--unified=3",
        "--",
    ]);
    args.extend([before.as_os_str().to_owned(), after.as_os_str().to_owned()]);
    run_command(path, command, &args, None, 8 * 1024 * 1024, None).await
}

async fn run_command(
    path: &Path,
    mut command: Command,
    args: &[OsString],
    input: Option<Vec<u8>>,
    output_limit: u64,
    output_file: Option<tokio::fs::File>,
) -> Result<RawOutput> {
    let cancellation = crate::cancellation::Cancellation::current();
    cancellation.check()?;
    #[cfg(unix)]
    command.process_group(0);
    let executable = command
        .as_std()
        .get_program()
        .to_string_lossy()
        .into_owned();
    let mut child = command
        .args(args)
        .current_dir(path)
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .with_context(|| {
            format!("start {executable}; verify it is installed and available on PATH")
        })?;
    let mut group = ProcessGroup::new(&child);
    let stdin = child.stdin.take();
    let stdout = child.stdout.take().context("capture stdout")?;
    let stderr = child.stderr.take().context("capture stderr")?;
    let result = {
        let work = async {
            let input_task = async move {
                if let (Some(mut stdin), Some(input)) = (stdin, input) {
                    if let Err(error) = stdin.write_all(&input).await
                        && error.kind() != std::io::ErrorKind::BrokenPipe
                    {
                        return Err(error);
                    }
                    if let Err(error) = stdin.shutdown().await
                        && error.kind() != std::io::ErrorKind::BrokenPipe
                    {
                        return Err(error);
                    }
                }
                Ok::<(), std::io::Error>(())
            };
            let output = async move {
                if let Some(mut file) = output_file {
                    let mut stdout = stdout;
                    tokio::io::copy(&mut stdout, &mut file).await?;
                    file.sync_all().await?;
                    Ok(Vec::new())
                } else {
                    read_bounded(stdout, output_limit).await
                }
            };
            let (stdout, stderr, status, ()) = tokio::try_join!(
                output,
                read_bounded(stderr, 2 * 1024 * 1024),
                child.wait(),
                input_task
            )?;
            Ok(RawOutput {
                code: status.code().unwrap_or(1),
                stdout,
                stderr,
            })
        };
        tokio::pin!(work);
        tokio::select! {
            biased;
            _ = cancellation.cancelled() => {
                group.interrupt();
                let _ = tokio::time::timeout(Duration::from_secs(2), &mut work).await;
                Err(anyhow::anyhow!(cancellation.message()))
            },
            _ = tokio::time::sleep(Duration::from_secs(120)) => {
                group.interrupt();
                let _ = tokio::time::timeout(Duration::from_secs(2), &mut work).await;
                Err(anyhow::anyhow!(if cancellation.remote_mutation_started() {
                    "Command exceeded 120 seconds; inspect GitHub before retrying: the remote mutation may have completed"
                } else {
                    "Command exceeded 120 seconds; inspect repository state before retrying a mutation"
                }))
            },
            result = &mut work => result,
        }
    };
    if result.is_ok() {
        group.disarm();
    } else {
        group.terminate();
        // Wait for the direct child before releasing the repository lock.
        let _ = child.kill().await;
    }
    match result {
        // Private gh token capture must reach its bounded credential parser
        // unchanged. Session.run redacts published gh output itself; typed API
        // readers sanitize/whitelist private results. Git owns inherited hooks.
        Ok(output) if executable != "gh" => Ok(crate::git_credentials::redact(output).await),
        Ok(output) => Ok(output),
        Err(error) => Err(error),
    }
}

/// A dropped future must also terminate hooks, credential helpers, and other descendants.
/// Unix commands have their own process group; Windows still uses direct-child cleanup.
struct ProcessGroup {
    #[cfg(unix)]
    pid: Option<i32>,
}
impl ProcessGroup {
    fn new(child: &tokio::process::Child) -> Self {
        #[cfg(not(unix))]
        let _ = child;
        Self {
            #[cfg(unix)]
            pid: child.id().and_then(|pid| i32::try_from(pid).ok()),
        }
    }
    fn disarm(&mut self) {
        #[cfg(unix)]
        {
            self.pid = None;
        }
    }
    fn interrupt(&self) {
        #[cfg(unix)]
        if let Some(pid) = self.pid {
            // SAFETY: this process group was created specifically for the command.
            unsafe {
                libc::kill(-pid, libc::SIGINT);
            }
        }
    }
    fn terminate(&mut self) {
        #[cfg(unix)]
        if let Some(pid) = self.pid.take() {
            // SAFETY: spawn used process_group(0); only this child's group is targeted.
            unsafe {
                libc::kill(-pid, libc::SIGKILL);
            }
        }
    }
}
impl Drop for ProcessGroup {
    fn drop(&mut self) {
        self.terminate();
    }
}

async fn read_bounded(
    reader: impl tokio::io::AsyncRead + Unpin,
    limit: u64,
) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    reader.take(limit + 1).read_to_end(&mut bytes).await?;
    if bytes.len() > limit as usize {
        return Err(std::io::Error::other(format!(
            "command output exceeds {limit} bytes; inspect state using the CLI"
        )));
    }
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn private_api_commands_pin_credentials_without_logging_or_repository_defaults() {
        let command = private_gh_command(Some("synthetic-session-token"));
        let environment: std::collections::BTreeMap<_, _> = command.as_std().get_envs().collect();
        for variable in ["GH_DEBUG", "DEBUG", "GH_REPO", "GH_HOST"] {
            assert_eq!(environment.get(std::ffi::OsStr::new(variable)), Some(&None));
        }
        for variable in [
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GH_ENTERPRISE_TOKEN",
            "GITHUB_ENTERPRISE_TOKEN",
        ] {
            assert_eq!(
                environment.get(std::ffi::OsStr::new(variable)),
                Some(&Some(std::ffi::OsStr::new("synthetic-session-token")))
            );
        }
        assert_eq!(command.as_std().get_args().count(), 0);
        let acquisition = private_gh_command(None);
        let environment: std::collections::BTreeMap<_, _> =
            acquisition.as_std().get_envs().collect();
        assert_eq!(
            environment.get(std::ffi::OsStr::new("GH_DEBUG")),
            Some(&None)
        );
        assert_eq!(environment.get(std::ffi::OsStr::new("DEBUG")), Some(&None));
        assert!(!environment.contains_key(std::ffi::OsStr::new("GH_TOKEN")));
    }

    #[test]
    fn stored_account_commands_ignore_every_environment_token() {
        let command = stored_gh_command();
        let environment: std::collections::BTreeMap<_, _> = command.as_std().get_envs().collect();
        for variable in [
            "GH_TOKEN",
            "GITHUB_TOKEN",
            "GH_ENTERPRISE_TOKEN",
            "GITHUB_ENTERPRISE_TOKEN",
            "GH_DEBUG",
            "DEBUG",
            "GH_REPO",
            "GH_HOST",
        ] {
            assert_eq!(environment.get(std::ffi::OsStr::new(variable)), Some(&None));
        }
        assert_eq!(command.as_std().get_args().count(), 0);
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn installed_gh_named_user_never_falls_back_to_conflicting_environment_tokens() {
        use std::{
            io::Write,
            os::unix::fs::{OpenOptionsExt, PermissionsExt},
        };
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                let _ = std::fs::remove_dir_all(&self.0);
            }
        }
        let directory =
            std::env::temp_dir().join(format!("desktop-gh-named-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir(&directory).unwrap();
        std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o700)).unwrap();
        let _cleanup = Cleanup(directory.clone());
        let mut probe = stored_gh_command();
        probe.arg("--version").env("GH_CONFIG_DIR", &directory);
        match probe.output().await {
            Ok(output) if output.status.success() => {}
            _ => {
                eprintln!("SKIP: installed gh named-user contract requires gh on PATH");
                return;
            }
        }
        // Unique user names ensure this fixture can never select an existing
        // real keychain entry, even on a developer's logged-in machine.
        let nonce = uuid::Uuid::new_v4().simple().to_string();
        let active = format!("ActiveFixture-{nonce}");
        let chosen = format!("ChosenFixture-{nonce}");
        let missing = format!("MissingFixture-{nonce}");
        let mut configuration = String::new();
        for host in ["github.com", "account-fixture.invalid"] {
            configuration.push_str(&format!("{host}:\n    user: {active}\n    oauth_token: synthetic-active\n    git_protocol: https\n    users:\n        {active}:\n            oauth_token: synthetic-active\n        {chosen}:\n            oauth_token: synthetic-named\n"));
        }
        let path = directory.join("hosts.yml");
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&path)
            .unwrap();
        file.write_all(configuration.as_bytes()).unwrap();
        drop(file);
        for host in ["github.com", "account-fixture.invalid"] {
            for (user, available) in [
                (chosen.clone(), true),
                (chosen.to_ascii_lowercase(), false),
                (missing.clone(), false),
            ] {
                let mut command = stored_gh_command();
                command.env("GH_CONFIG_DIR", &directory);
                for variable in [
                    "GH_TOKEN",
                    "GITHUB_TOKEN",
                    "GH_ENTERPRISE_TOKEN",
                    "GITHUB_ENTERPRISE_TOKEN",
                ] {
                    command.env(variable, "synthetic-conflicting-environment");
                }
                let output = run_command(
                    &directory,
                    command,
                    &crate::args(&[
                        "auth",
                        "token",
                        "--hostname",
                        host,
                        "--user",
                        &user,
                        "--no-refresh",
                    ]),
                    None,
                    64 * 1024,
                    None,
                )
                .await
                .unwrap();
                if available {
                    assert_eq!(output.code, 0, "named stored-account lookup failed");
                    assert!(
                        output.stdout.strip_suffix(b"\n").unwrap_or(&output.stdout)
                            == b"synthetic-named",
                        "gh did not select the explicitly named synthetic account"
                    );
                } else {
                    assert_eq!(
                        output.code, 1,
                        "missing named-account lookup unexpectedly succeeded"
                    );
                    assert!(
                        output.stdout.is_empty(),
                        "missing named-account lookup emitted a credential"
                    );
                }
            }
        }
        assert!(
            std::fs::read(&path).unwrap() == configuration.as_bytes(),
            "read-only token lookup rewrote the isolated gh configuration"
        );
    }

    #[tokio::test]
    async fn output_limit_boundary() {
        let bytes = vec![b'x'; 2 * 1024 * 1024 + 1];
        assert!(
            read_bounded(bytes.as_slice(), 2 * 1024 * 1024)
                .await
                .is_err()
        );
        assert_eq!(
            read_bounded(&bytes[..bytes.len() - 1], 2 * 1024 * 1024)
                .await
                .unwrap()
                .len(),
            bytes.len() - 1
        );
    }
}
