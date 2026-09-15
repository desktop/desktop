# 01 — Scope: Keep / Delete + Apple Intelligence

## 1. Keep (local-git complete)

Repositories: add existing, create new (with `.gitignore`/license/README templates), clone by URL (any remote, not just GitHub), remove (with/without trash), alias, locate missing, recent (max 3) + last-selected restore.

Working directory: status (`porcelain=2 -z`), staging (whole file + line/hunk partial via `apply --cached`), unstage, discard (file/selection), ignore (file/extension), reveal in Finder, copy path, filter list, oversized-file (>100MB-ish) LFS gate.

Commits: commit (incl. `--amend/--signoff/--no-verify/--allow-empty`), commit-message validation, co-authors via `Co-Authored-By:` trailers (keep generic — original gated it to GH repos, make it always available), amend flow, undo most-recent local commit, reset to commit (soft/mixed/hard + confirm), revert (incl. merge `-m 1`), checkout commit (detached + confirm).

Branches: list/filter/group (Recent/Default/Other), create/rename/delete (local + remote `push <r> :<b>`), checkout, compare ahead/behind + merge-base diff, merge (incl. `--squash/--no-verify`), rebase (+ interactive squash/reorder todo), cherry-pick (multi, `--empty=keep -m 1`), fast-forward (`fetch .` plumbing), merge-tree mergeability check, reflog recent branches (2500 entries).

Sync: fetch (`--prune --recurse-submodules`), pull (`--ff` if `pull.ff` unset, rebase.backend=merge pin), push (upstream set, `--force-with-lease` + confirm, `--follow-tags --dry-run` tag push detection, `--progress`), remotes add/remove/set-url/get-url, `remote set-head -a`, generic git auth (username/password, SSH host/passphrase/password, untrusted cert), proxy env, `safe.directory`.

Stash (Desktop-scoped `!!GitHub_Desktop<branch>` marker): create/pop/drop/move, stash-and-switch-branch, overwrite-stash confirm, stash diff viewer.

Tags: create annotated (`tag -a -m ''`), delete, unpushed-tag indicator, delete-guard if pushed.

Worktrees: full support — list (`worktree list --porcelain -z`), add (`-b`), rename/move, remove (+failed dialog), switch, per-worktree state seed/transfer.

Submodules: `update --init --recursive`, status parse, reset paths, submodule diff (SHA + Open). LFS: `install --skip-repo/repo`, `track --json`, `check-attr filter`, `filesNotTrackedByLFS` gate, LFS progress parsing. `.gitignore` read/save/append with CRLF-aware formatting. `user.name/email`, `init.defaultBranch`, `pull.rebase`, hook env (`core.hooksPath` proxy, enable/cache/shell), config-lock-file recovery UI.

History/diff: log (100/batch infinite scroll), changed files (`-C -M --raw --numstat`), blob show (incl. partial + truncation), text/unified+split diff, intra-line highlight, syntax highlight, whitespace hide, large-file gate (70MB buffer / ~4.4MB reasonable / 5000 chars/line), binary gate, image diffs (2-up/swipe/onion/difference, incl. DDS), submodule diff, diff search (`Cmd+F`), hunk expand, line-ending + bidi warnings, diff check-marks pref.

App: single-window shell, toolbar, foldouts, banners, dialog stack (250ms enter/100ms exit), update via Sparkle equivalent, crash report, CLI shim (`open path`, `clone url`), `x-github-client`-style deep link (keep generic `openrepo <url>?branch` — drop OAuth variant), Finder drop-to-add, commit drag-and-drop (cherry-pick/reorder/squash), full menus + shortcuts, VoiceOver/keyboard parity, tutorial repo flow, settings/about/release-notes/acknowledgements.

## 2. Delete (exact)

| Area | Delete files / symbols |
|------|------------------------|
| GitHub API | `lib/api.ts`, `endpoint-capabilities.ts`, `endpoint-token.ts`, `auth.ts`, `find-account.ts`, `get-account-for-repository.ts`, `commit-url.ts`, `pull-request-refs.ts`, `helpers/pull-request-matching.ts`, `web-flow-committer.ts`, `ci-checks/*`, `valid-notification-pull-request-review.ts`, `text-token-parser.ts` (GH autolink part) |
| Stores | `accounts-store.ts`, `sign-in-store.ts`, `token-store.ts`, `api-repositories-store.ts`, `issues-store.ts`, `pull-request-store.ts`, `pull-request-coordinator.ts`, `helpers/pull-request-updater.ts`, `helpers/find-upstream-remote.ts`, `helpers/find-default-remote.ts`, `helpers/find-forked-remotes-to-prune.ts`, `commit-status-store.ts`, `github-user-store.ts`, `alive-store.ts`, `notifications-store.ts`, `notifications-debug-store.ts`, `copilot-store.ts` |
| DB | `pull-request-database.ts`, `issues-database.ts`, `github-user-database.ts` (keep `repositories-database.ts`, `base-database.ts`) |
| Models | `github-repository.ts`, `pull-request.ts`, `account.ts`, `owner.ts`, `avatar.ts` (GH part), `dot-com-bots.ts`. Collapse `RepositoryWithGitHubRepository` → `Repository`. Delete `PreferencesTab.Accounts/Integrations/Copilot/Notifications` |
| Popups (delete cases) | `SignIn, PublishRepository, CreateFork, ChooseForkSettings, DeletePullRequest, StartPullRequest, PullRequestChecksFailed, CICheckRunRerun, PullRequestReview, PullRequestComment, TestNotifications, SAMLReauthRequired, InvalidatedToken, PushRejectedDueToMissingWorkflowScope, UpstreamAlreadyExists, ExternalEditorFailed, OpenWithExternalEditor, OpenShellFailed, GenerateCommitMessage*, Copilot*Conflict*, EditCopilot*, CopilotUserSettings/CustomProviders/ConfirmDelete*` |
| UI | `sign-in/*`, `publish-repository/*`, `forks/*`, `clone-github-repository.tsx`, `cloneable-repository-filter-list.tsx`, `branches/pull-request-*.tsx`, `open-pull-request/*`, `pull-request-quick-view.tsx`, `notifications/*`, `test-notifications/*`, `preferences/accounts.tsx`, `integrations.tsx`, `custom-integration-form.tsx`, `copilot.tsx`, `copilot-*.tsx`, `snapshot-card.tsx` (copilot part), `copilot/*`, `lib/sign-in.tsx`, `authentication-form.tsx`, `enterprise-server-*`, `lib/copilot-model-picker.tsx`, `secret-scanning/bypass-*` (GH push-protection API; keep local secret-scan error display as plain git stderr), `autocompletion/issues-autocompletion-provider.tsx` wiring |
| Editors/shells | `lib/editors/*`, `lib/shells/*`, `lib/custom-integration.ts` + dispatcher/store/menu/tutorial wiring (`selectedExternalEditor/selectedShell/useCustom*`, `openInExternalEditor/openInShell`, `OpenShellFailed` etc.) |
| Formatting/theme | `models/formatting-preferences.ts`, `lib/format-date.ts`, `format-relative.ts`, `format-number.ts`, `format-duration.ts`, `ui/relative-time.tsx` (replace with system), `ui/lib/application-theme.ts`, `theme-source.ts`, `theme-change-monitor.ts`, `ui/app-theme.tsx`, native-theme IPC (`native-theme-updated/set-native-theme-source`) |
| Notifications OS | `lib/notifications/*`, `find-toast-activator-clsid.ts`, `main-process/notifications.ts`, deps `desktop-notifications`, `@github/alive-client` |
| Menus | `View on GitHub`, `Create issue on GitHub`, `Compare on GitHub`, `Preview/Create pull request`, `Open in editor/shell` items. Keep `Show in Finder`, `Copy path`, git-local items |
| Stats fields | `theme`, `generateCommitMessage*`, copilot fields |

Shared infra to KEEP (reused by local features): `dialog/*`, `popup-manager.ts` (pruned), `button/checkbox/select/radio/row/text-box/link-button/form`, `local-storage.ts` (non-deleted keys), `http.ts`, `round.ts`, `timing.ts`.

## 3. Apple Intelligence (Foundation Models) — proposal, not port

Original Copilot usage (for parity planning):
- Commit-message generation: button in commit box with states idle/generating/cancel, disclaimer first-run, overwrite-warning if summary/description non-empty, `generatedByCopilot` flag, abort controller, streaming into summary/description. Model picker per account + BYOK + quota card.
- Conflict resolution: `ShowCopilotConflictsLoading → changes → resolution-summary → always-nudge` wizard inside multi-commit-operation; per-file reasoning + skipped-files (too large/unreadable/no markers).

Swift replacement (macOS 26+, `FoundationModels`):
- Gate with `#available(macOS 26, *)` + `SystemLanguageModel.default.isAvailable`. If unavailable: hide buttons (same as Copilot flag-gating).
- Commit message: on-device `LanguageModelSession` with prompt = staged diff stat + file names + recent summaries + branch name. Stream tokens into summary (first line ≤72 chars, warn don't block) + description. Keep: Cancel (cancel session), Regenerate/overwrite-warning dialog, disclaimer sheet (privacy: on-device), `generatedByAppleIntelligence` flag on `ICommitMessage` for stats. No network, no quota UI, no model picker — delete those.
- Conflicts: do NOT auto-resolve code with generative model v1. Instead: (a) keep 100% manual resolution UI (§07), (b) optional Explain-only button per file ("Explain these conflict markers", read-only, no file writes). Auto-apply is explicitly out of scope until evaluated.
- Privacy copy: "Runs on-device with Apple Intelligence. Diff content never leaves this Mac." Add Settings > Apple Intelligence toggle (default on) + `Don't ask again` for disclaimer. This replaces `PreferencesTab.Copilot` (1 toggle + availability status, no providers/models).
- Files: new `Services/AppleIntelligenceService.swift` (`isAvailable`, `generateCommitMessage(diffContext:) -> AsyncThrowingStream`, `explainConflict`). No keychain secrets needed.
