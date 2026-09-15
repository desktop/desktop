# TODO.md — cross-task handoff notes (native SwiftUI reimplementation)

Running notes for later PLAN.md tasks. Each entry names the owning task and the
contract it may rely on. Rules in `AGENTS.md` still apply (`electron/` read-only,
additive changes only, no GH/editor/Copilot/theme/notification code).

## From Task 7 (sync) — merged via `task/7-sync` → `native`

- **Seam:** `Git/Operations/Sync.swift` defines `SyncOperations` (refines Task 1
  `GitService`) + free-function arg builders/parsers. `LiveGitService` and
  `MockGitService` both conform. Later tasks: depend on `SyncOperations`, do not
  add requirements to `GitService` (parallel tasks code against the Task 1 contract).
  `MockGitService` supports remotes CRUD in-memory (`stubRemotes`); fetch/pull/push
  are no-op successes emitting initial progress.
- **Progress:** `Git/Progress/*` parsers are pure value types emitting
  `AppProgress` (ready for toolbar binding). Live ops currently run buffered
  `GitProcess` calls, emit the initial 0 event, then *replay* final stderr
  through the parsers. When `GitProcess` gains incremental stderr streaming,
  switch `fetchRemote`/`pullRepository`/`pushRepository` to stream lines live and
  tail `GIT_LFS_PROGRESS` via `LFSProgressParser` (parser is ready; file-tailing
  is the missing piece). `isLFSFilterLine` marks smudge-filter lines to skip.
- **Errors:** `Git/Auth.swift` `popupForSyncError` maps `GitError` → `Popup`
  (push-needs-pull, local-changes-overwritten + file list, LFS mismatch,
  secret-scan display-only, auth → generic sheet, background auth suppressed,
  merge/rebase conflicts → nil, deferred to Tasks 5–6). `AppStore.performSyncOperation`
  is the `performFailableOperation` equivalent — Task 2's DialogHost just presents
  whatever popup appears.
- **Popups reused unchanged:** `genericGitAuthentication`, `untrustedCertificate`,
  `addSSHHost` (carries host+fingerprint only — full `SSHHostChallenge`
  ip/keyType ride directly into `AddSSHHostView`), `sshKeyPassphrase`,
  `sshUserPassword`, `pushNeedsPull`, `localChangesOverwritten`,
  `discardChangesRetry`, `lfsAttributeMismatch`, `error`, `confirmForcePush`.
- **Views ready to wire (Task 2):** `Views/Shell/PushPullButton.swift`
  (`PushPullButton`, `AheadBehindBadgeView`, `RevertProgressView`, mock previews)
  renders `PushPullState` from `resolvePushPullState` — Task 2 only needs to feed
  it tip/remote/aheadBehind/tags/progress. Auth sheets in `Views/Dialogs/Auth*.swift`
  take data + `onSave`/`onSubmit`/`onDismiss` callbacks.
- **For Task 8 (tags/LFS):** `fetchTagsToPush` (follow-tags dry-run parse) is
  implemented; tag create/delete + `tagsToPush` store/clear lifecycle is Task 8's.
  `.lfsAttributeMismatch` mapping already exists.
- **For Task 9 (clone/onboarding):** `CloneProgressParser` is implemented and
  tested, but there is no `cloneRepository` Live op yet — Task 9 owns the clone
  dialog + op (arg shape: `git -c init.defaultBranch=… -c protocol.ext.allow=never
  -c protocol.ext.exe.allow=never clone --recursive [--progress] [-b] -- url path`).
  `addSafeDirectory` (Task 7, `Git/Auth.swift`) is ready for dubious-ownership
  onboarding; proxy env helper respects explicit `*_proxy` only (no system-proxy
  lookup yet).
- **For Task 10 (a11y):** buttons expose combined accessibility labels; note
  `accessibilityLiveRegion` does not exist on macOS (label-only announcements).
- **Harness flag:** `swiftc` test harnesses must now pass
  `-module-name GitDesktop` (`Sync.swift` uses module-qualified calls to
  disambiguate same-named protocol methods and free functions).
