# 08 — Repos, Settings, Prefs, Onboarding, Help

## 1. Add / Clone / Create (`add-repository/*`, `clone-repository/*`)

- Add existing: path picker (`NSOpenPanel` folders), toplevel resolve (`rev-parse`), match-existing else `AddRepository{path}` popup, invalid (bare/unsafe/missing) → error popup.
- Create: name/path, `.gitignore` templates (`gitignores.ts`), license templates (`licenses.ts`), README default (`write-default-readme.ts`), `init.defaultBranch`, `sanitized-repository-name.ts`. After init: add + select.
- Clone (generic URL only): URL + local path + branch (`CloneOptions`), `clone` cmd (§09) with progress + cancel, sensitive-path block (`~/`, `~/.ssh`, `~/.gnupg`, `~/.config`, `~/.gitconfig`), `ext::` block, `GIT_CLONE_PROTECTION` env. Delete GitHub tab + account picker + `group-repositories.ts` (GH).
- Publish: DELETE (GH-only). Local remotes are managed in Repository Settings → Remote.

## 2. Repository settings (`repository-settings/*`)

Dialog + vertical tabs: Remote (URL edit via `setRemoteURL`, `no-remote.tsx` empty state) | Ignored Files (`.gitignore` editor + examples link, CRLF-aware) | Git Config (per-repo user.name/email vs global, `git-config-user-form`) | (DELETE Fork Behavior). Footer Save/Cancel, lock-file error recovery (`ConfigLockFileExists` + delete).

## 3. Preferences (pruned to 5 tabs)

Title `Settings` (macOS). Vertical `TabBar`, content `tab-container`, footer Save/Cancel (reverts tabSize on cancel).

Keep:
- Git: name/email (`user.name/email` global, prefill from global only — delete account prefill), default branch (`init.defaultBranch`), hook env (enable/cache/shell `git-bash|pwsh|powershell|cmd`→macOS shells), Edit global .gitconfig, lock-file recovery.
- Appearance: Tab Size only (number 2/4/8, live-applies to diff). DELETE theme + date/time/number + absolute-dates.
- Prompts (all keep): confirm repo-removal / discard-changes / discard-permanently / discard-stash / checkout-commit / force-push / undo-commit / commit-filtered / commit-override / worktree-removal + `uncommittedChangesStrategy` (ask/stash-always?) + `showCommitLengthWarning`.
- Advanced: usage tracking opt-out, external credential helper (`useExternalCredentialHelper`), repo indicators (`repositoryIndicatorsEnabled`). DELETE OpenSSH-Windows (mac-only app).
- Accessibility: underline links (default true), diff check marks (default true).
- Apple Intelligence (new, replaces Copilot tab): availability status + enable toggle + privacy note. See `01-scope.md`.

Delete tabs: Accounts, Integrations, Copilot, Notifications.

## 4. Onboarding / tutorial / help

- Welcome (`welcome/*`): split left content + right illustration, light titlebar, exit 250ms. Steps: Start (Clone/Create/Add — DELETE Sign-in GitHub/Enterprise/Skip-sign-in) → ConfigureGit (name/email + Finish). `has-shown-welcome-flow` gates stats.
- Tutorial: right rail `tutorial-panel` checklist + expandable `ol` (~~PickEditor~~ deleted → CreateBranch/EditFile/MakeCommit(nudge arrow on commit box)/PushBranch/~~OpenPullRequest~~ replaced-done) with shortcut hints, Skip/Exit + `ConfirmExitTutorial`. `TutorialWelcome/Done` replace diff when no changes during tutorial. `isTutorialRepository` DB flag. `CreateTutorialRepositoryDialog`: name/path picker.
- About (`about/*`): version, Sparkle check, credits. DELETE Copilot responsible-use line. Acknowledgements list, Release-notes dialog, Terms, Thank-you: keep dialog component, drop GH-contributions fetch (show only local release notes).
- Help menu (keep local): User Guides → local help window (replace `shell.openExternal` GH URLs with bundled help), Keyboard Shortcuts sheet, Show Logs (`~/Library/Logs`), Report Issue → prefilled `mailto:` or local log export (no GH URL). Delete Contact-Support GH URL.
- `InstallGit` (missing git binary) + `CLIInstalled` + `MoveToApplicationsFolder` + `InstallingUpdate` (blocks quit while downloading): keep.
- Generic auth dialogs (keep): `GenericGitAuthentication` (user/pass), `UntrustedCertificate` (trust once), `AddSSHHost` (fingerprint), `SSHKeyPassphrase`, `SSHUserPassword`, `UpstreamAlreadyExists` is GH-fork-specific → DELETE, `LocalChangesOverwritten` (file list + retry action), `PushNeedsPull`, `OversizedFiles`, `HookFailed` (abort/ignore + terminal), `CommitProgress`, `DiscardChangesRetry`, `UnknownAuthors` (keep generic — ungate), `SecretScanning PushProtectionError` (local display; delete Bypass API call).
