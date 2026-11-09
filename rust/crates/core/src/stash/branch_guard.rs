//! Scoped native reference checks for native Git branch creation.
use crate::{Repository, args, discard_fs as work, process};
use anyhow::Result;
use std::{ffi::OsString, fs, path::Path};

pub(super) fn quote(value: &[u8]) -> Vec<u8> {
    let mut result = vec![b'\''];
    for b in value {
        if *b == b'\'' {
            result.extend_from_slice(b"'\\''");
        } else {
            result.push(*b);
        }
    }
    result.push(b'\'');
    result
}
pub(super) fn directory(path: &Path) -> Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path)?;
    let metadata = fs::symlink_metadata(path)?;
    anyhow::ensure!(
        metadata.is_dir() && !metadata.file_type().is_symlink(),
        "Branch guard directory must be a real directory"
    );
    Ok(())
}
pub(super) fn forget(base: &Path, id: &str) -> Result<()> {
    let path = base.join(format!("{id}.create-hooks"));
    match fs::symlink_metadata(&path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.into()),
        Ok(m) => {
            anyhow::ensure!(
                m.is_dir() && !m.file_type().is_symlink(),
                "Branch guard metadata changed; inspect before acknowledging"
            );
            fs::remove_dir_all(path)?;
            Ok(())
        }
    }
}
impl Repository {
    /// Ref-only branch commands preserve native tracking and reference callbacks.
    pub(in crate::stash) async fn branch_creation_guard(
        &self,
        base: &Path,
        id: &str,
        reference: &str,
        oid: &str,
        start: Option<(&str, &str)>,
    ) -> Result<Vec<OsString>> {
        self.direct_ref_guard(base, id, reference, oid, None, start)
            .await
    }

    /// Guard an exact direct-ref CAS while retaining native reference callbacks.
    pub(crate) async fn direct_ref_guard(
        &self,
        base: &Path,
        id: &str,
        reference: &str,
        oid: &str,
        old: Option<&str>,
        start: Option<(&str, &str)>,
    ) -> Result<Vec<OsString>> {
        anyhow::ensure!(
            reference.starts_with("refs/") && !reference.contains(['\0', '\n', '\r']),
            "Invalid guarded reference"
        );
        anyhow::ensure!(
            [Some(oid), old]
                .into_iter()
                .flatten()
                .all(|value| matches!(value.len(), 40 | 64)
                    && value.bytes().all(|byte| byte.is_ascii_hexdigit())),
            "Invalid guarded object ID"
        );
        let path = base.join(format!("{id}.create-hooks"));
        directory(&path)?;
        let shell = self.run(&args(&["var", "GIT_SHELL_PATH"])).await?;
        anyhow::ensure!(shell.code == 0, "Cannot resolve native Git shell");
        let shell = shell.stdout.strip_suffix(b"\n").unwrap_or(&shell.stdout);
        #[cfg(not(windows))]
        anyhow::ensure!(
            !shell.is_empty() && !shell.iter().any(u8::is_ascii_whitespace),
            "Unsupported native Git shell path"
        );
        let mut script = b"#!".to_vec();
        #[cfg(windows)]
        script.extend_from_slice(b"/bin/sh");
        #[cfg(not(windows))]
        script.extend_from_slice(shell);
        let probe = path.join("probe");
        work::private_write(&probe, b"")?;
        let probe_phase = format!("desktop-branch-probe-{id}");
        script.extend_from_slice(b"\nif [ \"$1\" = ");
        script.extend(quote(probe_phase.as_bytes()));
        script.extend_from_slice(b" ]; then\n printf ok > ");
        script.extend(quote(probe.as_os_str().as_encoded_bytes()));
        script.extend_from_slice(b"\n exit $?\nfi\n");
        // Remove only the guard's own hook overrides. The caller's native
        // parameters and operation credential routing stay in inherited env,
        // never interpolated into this persisted hook script.
        script.extend_from_slice(b"\nrestore_parameters() {\n if [ \"${DESKTOP_RS_GIT_BASE_PARAMETERS_PRESENT:-0}\" = 1 ]; then\n  GIT_CONFIG_PARAMETERS=$DESKTOP_RS_GIT_BASE_PARAMETERS\n  export GIT_CONFIG_PARAMETERS\n else\n  unset GIT_CONFIG_PARAMETERS\n fi\n");
        script.extend_from_slice(b"}\ninput=");
        script.extend(quote(path.join("input").as_os_str().as_encoded_bytes()));
        script.extend_from_slice(b".$$\ntrap 'rm -f \"$input\"' 0\ncat >\"$input\" || exit 1\nif [ \"$1\" = preparing ] || [ \"$1\" = prepared ]; then\n restore_parameters\n ref=");
        script.extend(quote(reference.as_bytes()));
        script.extend_from_slice(b"\n symbolic=$(git symbolic-ref --quiet \"$ref\")\n status=$?\n [ \"$status\" = 1 ] || { echo 'Reviewed creation destination is symbolic or unreadable' >&2; exit 1; }\n");
        if let Some(old) = old {
            script.extend_from_slice(
                b" actual=$(git show-ref --verify --hash \"$ref\") || exit 1\n [ \"$actual\" = ",
            );
            script.extend(quote(old.as_bytes()));
            script.extend_from_slice(
                b" ] || { echo 'Reviewed reference tip changed' >&2; exit 1; }\n",
            );
        } else {
            script.extend_from_slice(b" git show-ref --verify --quiet \"$ref\"\n [ \"$?\" = 1 ] || { echo 'Reviewed creation destination already exists or cannot be read' >&2; exit 1; }\n");
        }
        if let Some((start, expected)) = start {
            script.extend_from_slice(b" actual=$(git show-ref --verify --hash ");
            script.extend(quote(start.as_bytes()));
            script.extend_from_slice(b") || exit 1\n [ \"$actual\" = ");
            script.extend(quote(expected.as_bytes()));
            script.extend_from_slice(b" ] || { echo 'Reviewed branch start ref changed; creation refused' >&2; exit 1; }\n");
        }
        script.extend_from_slice(b" found=0\n while IFS=' ' read -r old new name; do\n  [ \"$name\" = \"$ref\" ] && [ \"$old\" = ");
        let absent = "0".repeat(oid.len());
        script.extend(quote(old.unwrap_or(&absent).as_bytes()));
        script.extend_from_slice(b" ] && [ \"$new\" = ");
        script.extend(quote(oid.as_bytes()));
        script.extend_from_slice(b" ] || { echo 'Creation transaction differs from the reviewed branch and tip' >&2; exit 1; }\n  found=1\n done <\"$input\"\n [ \"$found\" = 1 ] || { echo 'Reviewed creation transaction was not found' >&2; exit 1; }\nfi\nrestore_parameters\ngit -c color.ui=false -c core.warnAmbiguousRefs=false hook run --ignore-missing --to-stdin=\"$input\" reference-transaction -- \"$@\"\n");
        // Probe a private event with the identical dispatcher so no user
        // reference callback is ever given a synthetic transaction phase.
        for event in ["reference-transaction", probe_phase.as_str()] {
            let hook = path.join(event);
            work::private_write(&hook, &script)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(hook, fs::Permissions::from_mode(0o700))?;
            }
        }
        let overrides = self
            .deletion_hook_overrides(&[b"reference-transaction"])
            .await?;
        let mut result = args(&["-c"]);
        let mut hooks = OsString::from("core.hooksPath=");
        hooks.push(&path);
        result.push(hooks);
        for (key, _) in overrides {
            let mut setting = key.clone();
            setting.extend_from_slice(if key == b"hook.reference-transaction.enabled" {
                b"=true"
            } else {
                b"=false"
            });
            result.push("-c".into());
            result.push(crate::os_from_bytes(&setting)?);
        }
        let mut test = result.clone();
        test.extend(args(&[
            "hook",
            "run",
            "--allow-unknown-hook-name",
            "--ignore-missing",
            &probe_phase,
            "--",
            &probe_phase,
        ]));
        let output = process::run_checkout(&self.path, &test).await?;
        anyhow::ensure!(
            output.code == 0 && fs::read(&probe)? == b"ok",
            "Branch protection hook did not run; use a supported Git version and an executable repository filesystem: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        Ok(result)
    }
    pub(in crate::stash) async fn branch_destination_direct(&self, reference: &str) -> Result<()> {
        let output = self
            .run(&args(&["symbolic-ref", "--quiet", reference]))
            .await?;
        anyhow::ensure!(
            output.code == 1,
            "Branch destination is symbolic or unreadable; choose a new direct local name"
        );
        Ok(())
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::{
        io::Write,
        path::PathBuf,
        process::{Command, Stdio},
    };

    struct Fixture {
        root: PathBuf,
        old: String,
        new: String,
    }
    impl Fixture {
        fn git(&self, arguments: &[&str], input: Option<&[u8]>) -> String {
            let mut command = Command::new("git");
            command
                .arg("-C")
                .arg(&self.root)
                .args(arguments)
                .env("GIT_CONFIG_GLOBAL", self.root.join("global.config"))
                .env("GIT_CONFIG_NOSYSTEM", "1")
                .env("GIT_CONFIG_COUNT", "0")
                .env_remove("GIT_CONFIG_PARAMETERS")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped());
            let mut child = command.spawn().unwrap();
            if let Some(input) = input {
                child.stdin.take().unwrap().write_all(input).unwrap();
            }
            let output = child.wait_with_output().unwrap();
            assert!(output.status.success(), "native ref fixture command failed");
            String::from_utf8(output.stdout)
                .unwrap()
                .trim_end_matches('\n')
                .to_owned()
        }
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("desktop-direct-ref-'{}", uuid::Uuid::new_v4()));
            fs::create_dir(&root).unwrap();
            fs::write(root.join("global.config"), b"").unwrap();
            let mut fixture = Self {
                root,
                old: String::new(),
                new: String::new(),
            };
            fixture.git(&["init", "-q"], None);
            let tree = fixture.git(&["hash-object", "-w", "-t", "tree", "--stdin"], Some(b""));
            for (message, new) in [("old", false), ("new", true)] {
                let bytes = format!(
                    "tree {tree}\nauthor Fixture <fixture@example.invalid> 1 +0000\ncommitter Fixture <fixture@example.invalid> 1 +0000\n\n{message}\n"
                );
                let oid = fixture.git(
                    &["hash-object", "-w", "-t", "commit", "--stdin"],
                    Some(bytes.as_bytes()),
                );
                if new {
                    fixture.new = oid;
                } else {
                    fixture.old = oid;
                }
            }
            fixture.git(&["update-ref", "refs/heads/protected", &fixture.old], None);
            fixture.git(
                &["update-ref", "refs/remotes/source/topic", &fixture.old],
                None,
            );
            fixture.git(&["update-ref", "refs/desktop/private", &fixture.new], None);
            fixture.git(
                &[
                    "config",
                    "core.hooksPath",
                    fixture.root.join(".git/hooks").to_str().unwrap(),
                ],
                None,
            );
            let hook = fixture.root.join(".git/hooks/reference-transaction");
            let mut script = b"#!/bin/sh\nprintf '%s\\n' \"$1\" >> ".to_vec();
            script.extend(quote(
                fixture.root.join("events").as_os_str().as_encoded_bytes(),
            ));
            script.push(b'\n');
            fs::write(&hook, script).unwrap();
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(hook, fs::Permissions::from_mode(0o700)).unwrap();
            fixture
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    #[tokio::test]
    async fn direct_ref_guard_keeps_native_callbacks_and_rejects_symbolic_tip_and_source_races() {
        let fixture = Fixture::new();
        let repository = Repository::open(&fixture.root).await.unwrap();
        let base = fixture.root.join("guards");
        let reference = "refs/remotes/source/topic";
        let guarded = |id: &str| id.to_owned();
        let id = guarded("native");
        let mut command = repository
            .direct_ref_guard(
                &base,
                &id,
                reference,
                &fixture.new,
                Some(&fixture.old),
                Some(("refs/desktop/private", &fixture.new)),
            )
            .await
            .unwrap();
        assert!(
            !fixture.root.join("events").exists(),
            "guard probe must not invoke user reference callbacks"
        );
        command.extend(args(&[
            "update-ref",
            "--no-deref",
            reference,
            &fixture.new,
            &fixture.old,
        ]));
        assert_eq!(repository.run(&command).await.unwrap().code, 0);
        assert_eq!(
            fixture.git(&["show-ref", "--verify", "--hash", reference], None),
            fixture.new
        );
        let events = fs::read_to_string(fixture.root.join("events")).unwrap();
        assert!(events.lines().any(|phase| phase == "prepared"));
        assert!(events.lines().any(|phase| phase == "committed"));
        assert!(
            events
                .lines()
                .all(|phase| ["preparing", "prepared", "committed"].contains(&phase))
        );
        for race in ["symbolic", "tip", "source"] {
            fixture.git(&["update-ref", "--no-deref", reference, &fixture.old], None);
            fixture.git(&["update-ref", "refs/desktop/private", &fixture.new], None);
            let id = guarded(race);
            let mut command = repository
                .direct_ref_guard(
                    &base,
                    &id,
                    reference,
                    &fixture.new,
                    Some(&fixture.old),
                    Some(("refs/desktop/private", &fixture.new)),
                )
                .await
                .unwrap();
            match race {
                "symbolic" => {
                    fixture.git(&["symbolic-ref", reference, "refs/heads/protected"], None);
                }
                "tip" => {
                    fixture.git(&["update-ref", reference, &fixture.new], None);
                }
                "source" => {
                    fixture.git(&["update-ref", "refs/desktop/private", &fixture.old], None);
                }
                _ => unreachable!(),
            }
            command.extend(args(&[
                "update-ref",
                "--no-deref",
                reference,
                &fixture.new,
                &fixture.old,
            ]));
            assert_ne!(repository.run(&command).await.unwrap().code, 0, "{race}");
            assert_eq!(
                fixture.git(
                    &["show-ref", "--verify", "--hash", "refs/heads/protected"],
                    None
                ),
                fixture.old
            );
            if race == "symbolic" {
                assert_eq!(
                    fixture.git(&["symbolic-ref", reference], None),
                    "refs/heads/protected"
                );
            } else {
                assert_eq!(
                    fixture.git(&["show-ref", "--verify", "--hash", reference], None),
                    if race == "tip" {
                        &fixture.new
                    } else {
                        &fixture.old
                    }
                    .to_owned()
                );
            }
        }
    }
}
