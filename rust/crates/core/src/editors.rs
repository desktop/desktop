//! User-selected editor commands, resolved without a shell and bound to a repository.
use crate::{GitPath, Repository, cancellation, discard_fs};
use anyhow::{Context, Result, bail};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    ffi::{OsStr, OsString},
    path::{Path, PathBuf},
    process::Stdio,
};

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum ExternalEditor {
    #[default]
    Automatic,
    Command {
        program: String,
        #[serde(default)]
        args: Vec<String>,
        #[serde(default)]
        terminal: bool,
    },
}
impl ExternalEditor {
    pub(crate) fn validate(&self) -> Result<()> {
        if let Self::Command { program, args, .. } = self {
            anyhow::ensure!(
                !program.is_empty() && !program.contains('\0') && program.len() <= 4096,
                "editor program must be a nonempty executable name or path"
            );
            anyhow::ensure!(
                args.len() <= 64
                    && args.iter().map(String::len).sum::<usize>() <= 65536
                    && args.iter().all(|arg| !arg.contains('\0')),
                "editor arguments exceed limits or contain NUL"
            );
        }
        Ok(())
    }
}
#[derive(Clone, Serialize)]
struct AvailableEditor {
    name: &'static str,
    program: PathBuf,
    terminal: bool,
    directories: bool,
}
fn executable(path: &Path) -> bool {
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}
fn absolute_executable(path: &Path) -> Option<PathBuf> {
    let parent = path
        .parent()
        .filter(|value| !value.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    // Keep the final symlink name: multicall editors use argv[0] to choose
    // their mode, while an absolute parent prevents CWD from changing lookup.
    Some(parent.canonicalize().ok()?.join(path.file_name()?))
}
fn locate(program: &OsStr) -> Option<PathBuf> {
    let program_path = Path::new(program);
    if program_path.components().count() > 1 || program_path.is_absolute() {
        return executable(program_path)
            .then(|| absolute_executable(program_path))
            .flatten();
    }
    let search = std::env::var_os("PATH").unwrap_or_default();
    for parent in std::env::split_paths(&search) {
        let candidate = parent.join(program);
        if executable(&candidate) {
            return absolute_executable(&candidate);
        }
        #[cfg(windows)]
        for extension in ["exe", "com", "cmd", "bat"] {
            let candidate = candidate.with_extension(extension);
            if executable(&candidate) {
                return absolute_executable(&candidate);
            }
        }
    }
    None
}
fn discover() -> Vec<AvailableEditor> {
    let mut found = Vec::new();
    for (name, command, terminal, directories) in [
        ("Visual Studio Code", "code", false, true),
        ("Visual Studio Code Insiders", "code-insiders", false, true),
        ("VSCodium", "codium", false, true),
        ("Sublime Text", "subl", false, true),
        ("Zed", "zed", false, true),
        ("Kate", "kate", false, true),
        ("Gedit", "gedit", false, false),
        ("Mousepad", "mousepad", false, false),
        ("Notepad++", "notepad++", false, false),
        ("Notepad", "notepad.exe", false, false),
        ("Neovim", "nvim", true, true),
        ("Vim", "vim", true, true),
        ("Nano", "nano", true, false),
        ("Vi", "vi", true, true),
        ("Micro", "micro", true, false),
    ] {
        if let Some(program) = locate(OsStr::new(command)) {
            found.push(AvailableEditor {
                name,
                program,
                terminal,
                directories,
            });
        }
    }
    #[cfg(target_os = "macos")]
    if executable(Path::new("/usr/bin/open")) {
        found.push(AvailableEditor {
            name: "TextEdit",
            program: "/usr/bin/open".into(),
            terminal: false,
            directories: false,
        });
    }
    found.sort_by_key(|editor| editor.terminal);
    found
}
/// Describe available editor executables without launching any application.
pub async fn available_editors(configuration: ExternalEditor) -> Result<Value> {
    configuration.validate()?;
    cancellation::blocking(move || Ok(json!({"configuration":configuration,"editors":discover()})))
        .await
}
/// A fixed executable and argument vector, usable with the CLI's inherited terminal.
pub struct EditorLaunch {
    pub program: PathBuf,
    pub args: Vec<OsString>,
    pub directory: PathBuf,
    pub terminal: bool,
}
fn substitute(template: &str, target: &Path, repository: &Path) -> OsString {
    let mut output = OsString::new();
    let mut remaining = template;
    while let Some(position) = remaining.find(['{']) {
        output.push(&remaining[..position]);
        remaining = &remaining[position..];
        if let Some(suffix) = remaining.strip_prefix("{path}") {
            output.push(target.as_os_str());
            remaining = suffix;
        } else if let Some(suffix) = remaining.strip_prefix("{repo}") {
            output.push(repository.as_os_str());
            remaining = suffix;
        } else {
            output.push("{");
            remaining = &remaining[1..];
        }
    }
    output.push(remaining);
    output
}
impl Repository {
    /// Resolve a repository-relative file, rejecting metadata and symlink traversal.
    pub async fn editor_launch(
        &self,
        path: Option<GitPath>,
        configuration: ExternalEditor,
    ) -> Result<EditorLaunch> {
        configuration.validate()?;
        let repository = self.path().to_owned();
        cancellation::blocking(move || {
            let target = if let Some(path) = path {
                let path = discard_fs::checked_path(path)?;
                let target = repository.join(path);
                // Native canonical paths preserve filename bytes and avoid handing
                // an unchecked symlink operand to the editor.
                let canonical = target.canonicalize().context("editor target does not exist")?;
                anyhow::ensure!(canonical.starts_with(&repository), "editor target escapes the repository through a symlink");
                anyhow::ensure!(canonical.is_file(), "editor target must be an existing file");
                discard_fs::checked_path(GitPath::Bytes { bytes: canonical.strip_prefix(&repository)?.as_os_str().as_encoded_bytes().to_vec() })?;
                canonical
            } else {repository.clone()};
            let (program, templates, terminal) = match configuration {
                ExternalEditor::Automatic => {
                    let editor = discover().into_iter().find(|editor| target.is_file() || editor.directories)
                        .context("No suitable editor found. Configure an editor in Settings or use the CLI preferences command.")?;
                    let mut templates = Vec::<String>::new();
                    #[cfg(target_os = "macos")]
                    if editor.name == "TextEdit" {templates.extend(["-a".into(),"TextEdit".into()]);}
                    if editor.name != "Notepad" && editor.name != "Notepad++" && editor.name != "TextEdit" {templates.push("--".into());}
                    templates.push("{path}".into());
                    (editor.program, templates, editor.terminal)
                }
                ExternalEditor::Command { program, mut args, terminal } => {
                    let program = locate(OsStr::new(&program)).context("Configured editor executable was not found or is not executable")?;
                    if !args.iter().any(|arg| arg.contains("{path}")) {args.push("{path}".into());}
                    (program, args, terminal)
                }
            };
            let args = templates.iter().map(|arg| substitute(arg, &target, &repository)).collect();
            Ok(EditorLaunch {program, args, directory:repository, terminal})
        }).await
    }
    /// Launch a GUI editor without holding a repository lock for the editing session.
    pub async fn open_editor(
        &self,
        path: Option<GitPath>,
        configuration: ExternalEditor,
    ) -> Result<Value> {
        let plan = self.editor_launch(path, configuration).await?;
        if plan.terminal {
            bail!(
                "This editor needs an interactive terminal. Run desktop-rs -C <repository> editor <file> in Termux or a terminal, then refresh and stage the edited resolution."
            );
        }
        let mut command = tokio::process::Command::new(plan.program);
        command
            .args(plan.args)
            .current_dir(plan.directory)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        #[cfg(unix)]
        command.process_group(0);
        cancellation::Cancellation::current().check()?;
        let mut child = command.spawn().context("launch configured editor")?;
        match tokio::time::timeout(std::time::Duration::from_millis(200), child.wait()).await {
            Ok(Ok(status)) if !status.success() => bail!(
                "Editor exited unsuccessfully ({}). Check its executable and argument settings.",
                status
                    .code()
                    .map_or_else(|| "signal".to_owned(), |code| code.to_string())
            ),
            Ok(Err(error)) => return Err(error).context("wait for editor launch"),
            Ok(Ok(_)) => {
                return Ok(
                    json!({"code":0,"stdout":"Editor launch completed. Save your changes, then refresh the conflict preview.","stderr":""}),
                );
            }
            Err(_) => {}
        }
        // Reap editors while the service runs. Closing the service leaves the
        // independent editor running, as ordinary desktop launches do.
        tokio::spawn(async move {
            let _ = child.wait().await;
        });
        Ok(
            json!({"code":0,"stdout":"Editor launched. Save your changes, then refresh the conflict preview.","stderr":""}),
        )
    }
}
