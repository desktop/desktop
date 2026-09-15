# TODO — cross-task handoff notes

Running notes for later PLAN.md tasks. Append, don't rewrite history.

## Task 3 → Task 2 (shell / DialogHost / BannerHost)
- `Views/Changes/ChangesTabView.swift` + `ChangesStore` are standalone; wire
  them into the Task-2 split view when the shell lands.
- Task 3 emits these `Popup` cases via `AppStore.showPopup` (DialogHost must
  render them): `.confirmDiscardChanges` (from `requestDiscard`),
  `.warnLocalChangesBeforeUndo` (undo slide row), `.error` (commit/ignore
  failures + inline `errorMessage` alert in `ChangesTabView`).
- Commit-flow confirms (unknown co-authors, filtered-files, oversized/LFS,
  conflict-markers) are presented **locally** in `CommitBoxView` sheets, NOT
  via popups. When DialogHost lands, decide one home for them to avoid
  double dialogs (recommendation: keep them local — they are continuations
  with resume closures, not app-level popups).

## Task 3 → Task 4 (diff viewer)
- Partial `DiffSelection`s currently commit as **full files**:
  `ChangesStore.performCommit` stages `filePaths` wholesale and
  `LiveGitService.commit` runs `git add`. Task 4 should add patch-based
  staging (`git apply --cached`) for partial selections before calling commit.
- Plug `SeamlessDiffSwitcher` beside `ChangesTabView`; file identity is
  `WorkingDirectoryFileChange.id` (`"<Kind>+<path>[+<oldPath>]"`), selection
  lives in `ChangesStore.selectedFileIDs`.
- `filterBranches` (branch-name provider) is pure + tested in
  `ChangesLogic.swift`, awaiting Task-5 branch UI.

## Task 3 → Task 5/8 (history / stash / undo / amend)
- `ChangesStore.branch`, `.commitAuthor`, `.mostRecentLocalCommit`,
  `.branches`, `.localAuthors` are set manually today — wire them to real
  history/branch state when it lands.
- Stash row toggles `showingStash`; the viewer is a Task-8 placeholder in
  `ChangesTabView`. Amend stop is implemented; amend *start* is Task 8.
- Discard execution is Task 8's (Task 3 only posts the confirm popup).

## Fixes / gotchas worth knowing
- `parseCommitSHA` (`Git/GitError.swift`) now handles root commits
  (`[main (root-commit) sha]`); covered by `ChangesLogicTests.testParseCommitSHA`.
- No test target exists (pbxproj is hands-off). Run suites via:
  `xcrun swiftc GitDesktop/GitDesktop/Models/*.swift GitDesktop/GitDesktop/Git/GitProcess.swift GitDesktop/GitDesktop/Git/GitError.swift GitDesktop/GitDesktop/Git/Parsers/*.swift GitDesktop/GitDesktop/Git/GitService.swift GitDesktop/GitDesktop/Views/Changes/ChangesLogic.swift GitDesktop/GitDesktop/Tests/ParserTests.swift GitDesktop/GitDesktop/Tests/ChangesLogicTests.swift <harness-main.swift> -o /tmp/tests && /tmp/tests`
  Only Foundation-only files compile in the CLI harness — keep view logic in
  `ChangesLogic.swift` (e.g. `matchRanges` lives there, not in `PathLabel.swift`).
- Xcode 27 SDK notes: `onKeyPress(KeyEquivalent)` overloads are gone — use the
  `onKeyPress { press in … }` (`KeyPress.key`) closure form. There is no
  `.accessibilityLiveRegion` modifier (dropped; live-region needs in sheets
  come from focus + labels). Avoid `.foregroundStyle(cond ? .accentColor : .secondary)`
  ternaries (Color vs HierarchicalShapeStyle mismatch) — use `.foregroundColor`
  with explicit `Color`s.

## Task 4 → Tasks 3, 5, 8: diff viewer integration (`GitDesktop/GitDesktop/Views/Diff/`)

- Entry point is `SeamlessDiffSwitcher` (props mirror `IDiffProps` + seamless props).
  File identity comes from `DiffFileDescriptor`, which has `init(workingDirectoryFile:)`
  and `init(committedFile:)` converters — Task 3 passes the former, Tasks 5/8 the latter.
- Owners must pass `diff: Diff?` **and** `fileContents: DiffFileContents?` (old/new content
  lines). A nil `diff` renders the loading spinner. Hunk expansion and the bottom dummy
  hunk only work when `fileContents?.canBeExpanded == true` with non-empty `newLines`;
  without contents the rows still render (no expansion, no highlight context).
- `DiffFileContents` loading (`getFileContents` equivalent: `git show <commit>:<path>` for
  old, workdir read for new) is **not implemented** — whoever loads diffs for Task 3/5
  needs to build it.
- Selection is parent-owned: pass `selection: DiffSelection?` + `onIncludeChanged`.
  Gutter toggles, hunk check-all, drag-select, and Select All all funnel through
  `onIncludeChanged` with an updated `DiffSelection`. Nil selection (or `readOnly: true`,
  or non-selectable file) disables all interaction — use that for history/stash (Tasks 5/8).
- Discard contract: `onDiscardChanges` receives a `DiffSelection.none` with **only the
  target lines selected** (`withRangeSelection(from:length:selected:true)`), plus the
  original labels via `DiffRowModel.discardLabel`. The confirm dialog + actual discard
  (Task 3) consumes this; `askForConfirmationOnDiscard` only controls the "…" suffix.
- Prefs already have `Defaults` keys (Task 1): `hideWhitespaceInChangesDiff`,
  `hideWhitespaceInHistoryDiff`, `showSideBySideDiff`, `imageDiffType`, `showDiffCheckMarks`.
  Bind them to the switcher props; `onChangeImageDiffType` persists the image mode.
- `DiffExpansion.withExpansionTypes` is applied inside `TextDiffView` because Task 1's
  `DiffParser` leaves hunk `expansionType` as `.none` (the reference parser assigns
  Up/Down/Both/Short at parse time). If diff loading ever moves into `Git/`, apply it there
  instead and drop the view-side call.
- `ImageDiffType` raw values (twoUp=0, swipe=1, onionSkin=2, difference=3) match the
  segmented-control order; persist the raw value like the reference persists the tab index.
- Deliberate scope omissions (do not re-add): GitHub links in submodule/CRLF/bidi
  warnings (plain text instead), binary "Open with default" → Show in Finder via
  `NSWorkspace`, DDS image support dropped.
- Docs correction: `GitDesktop/Docs/03-design-system.md` maps `AriaLiveContainer` to
  `.accessibilityLiveRegion`, but that modifier **does not exist** in the macOS 27 SDK
  (verified with `swiftc -typecheck`). The find bar uses
  `.accessibilityAddTraits(.updatesFrequently)` instead.

## For Task 2 (shell: DialogHost / BannerHost / toolbar)
- Merge wizard (`Views/Merge/MergeWizard.swift`) emits `Banner` via `onBanner`
  and `Popup` via `onShowPopup`. Render these banner cases (views already exist
  in `Views/Merge/UnmergedFiles.swift`): `.successfulMerge`,
  `.branchAlreadyUpToDate`, `.mergeConflictsFound` (has `View conflicts`
  → reopen action), `.conflictsFound`.
- Present these Task 5 views from `.sheet(item: Popup)`: `CreateBranchDialog`,
  `RenameBranchDialog`, `DeleteBranchDialog` (`Views/Branches/BranchDialogs.swift`),
  `MergeWizardView`, `UnreachableCommitsDialog`, `CommitConflictsWarningView`.
- Known placeholder: `MergeWizardView.handleMergeResult(.failed)` emits
  `.multiCommitOperation(repositoryID: 0)` — replace `0` with the real
  repository ID when DialogHost wires the wizard.

## For Task 4 (diff viewer)
- `SelectedCommitsView` (`Views/History/SelectedCommits.swift`) takes a generic
  `DiffContent` slot, defaulting to `HistoryDiffPlaceholder`. Wire the real
  `SeamlessDiffSwitcher` in read-only mode there.
- There is still no `GitService` API to load per-commit changed files /
  `linesAdded`/`linesDeleted` (`LogParser.parseChangedFiles` from Task 1 needs a
  caller). Add e.g. `committedFiles(sha:)` when wiring the history pane.

## For Task 6 (rebase / cherry-pick / squash / reorder + drag-drop)
- `CommitListView` exposes `onCherryPick` / `onSquash` / `onReorder` and drags
  via `CommitDragPayload` (`.draggable`). Insertion-point drop and
  keyboard-reorder mode are stubbed seams — implement there.
- `BranchRowView` drop → `onDropCommits(branch, shas)` is the cherry-pick seam.
- `MergeCallToActionWithConflictsView` rebase entry routes to
  `onInvoke(.rebase)` — Task 6 owns the rebase flow.
- `MergeWizardStep` names mirror `MultiCommitOperationStepKind` so both can be
  unified later. Copilot conflict steps are deleted per scope — do not re-add.

## For Task 7 (sync)
- `Branch.upstream` / `upstreamRemoteName` already exist (Task 1 models).
  `BranchesContainer` shows no ahead/behind or push/pull state — wire it up.

## For Task 8 (stash / tags / worktrees / reset / revert / checkout / amend)
- Stubbed callbacks waiting for owners: `onCheckoutInNewWorktree` (worktrees),
  `onCreateTag` / `onDeleteTag` (tags), `onResetToCommit` / `onCheckoutCommit` /
  `onRevertCommit` / `onUndoCommit` / `onAmendCommit`.

## For all tasks
- Task 5 views take explicit props + callbacks and do NOT depend on `AppStore`,
  so Tasks 2/9 can wire them into the shell.
- `LiveGitService.branches()` is real (for-each-ref); use `MockGitService` /
  `MockMergeService` for previews and UI work.
- `ConflictMarkers.unmergedEntries` (`Views/Merge/MergeService.swift`) backfills
  conflict-marker counts via `git diff --check` because Task 1 `status()` passes
  empty `ConflictDetails` (parser `conflictMarkerCount` is always 0). If Task 1
  ever populates counts in `status()`, the `unmergedEntries` fallback still
  prefers parser counts and stays correct.
- Tests live in-app (`Tests/HistoryTests.swift`, same harness style as
  `Tests/ParserTests.swift` — no test target; run via the `swiftc` harness).
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).

## For Task 2 (shell: DialogHost / BannerHost / toolbar)
- Present `MultiCommitWizardView` (`Views/Merge/MultiCommitWizard.swift`) from
  `.sheet(item: Popup)` for `.multiCommitOperation` and `.warnForcePush`
  (both Popup cases already exist in Task 1's `Models/Popup.swift`).
  Sub-views usable standalone: `RebaseChooseBranchView`,
  `MultiCommitProgressView`, `WarnForcePushView` (persists
  `Defaults.confirmForcePush`), `ConfirmAbortOperationView`,
  `MultiCommitConflictsView`.
- Show `ContinueOperationCTAView` in the Changes tab while a rebase or
  cherry-pick is paused on conflicts. Probes:
  `LiveMultiCommitService().isRebaseInProgress(gitDir:)` (`REBASE_HEAD`) and
  `isCherryPickInProgress(gitDir:)` (`CHERRY_PICK_HEAD`).
- All result banners already exist in Task 1's `Models/Banner.swift`
  (`.successfulRebase`, `.rebaseConflictsFound`, `.branchAlreadyUpToDate`,
  `.successfulCherryPick`, `.cherryPickConflictsFound`, `.cherryPickUndone`,
  `.successfulSquash`, `.squashUndone`, `.successfulReorder`,
  `.reorderUndone`). Use the `*ResultBanner` helpers in
  `Views/Merge/MultiCommitOperation.swift`; the `actionToken` reopens the
  conflicts dialog.

## For Task 5 (history / branches / merge — unification + wiring)
- Type twins to unify at merge (kept separate so Task 6 compiles standalone):
  `CommitDropPayload` ↔ `CommitDragPayload` (identical wire shape, typealias
  them), `areCommitsContiguous` ↔ `isContiguousSelection` (same semantics),
  `MultiCommitConflictFile` ↔ `UnmergedFileEntry` (path + resolved flag).
- `CommitListView` drags (`CommitDragPayload`) feed `routeCommitDrop` in
  `Services/DragDrop.swift`: branch → `.cherryPick`, commit row →
  `.squash(ontoSHA:)`, insertion point → `.reorder(beforeSHA:)`.
- `BranchRowView onDropCommits(branch, shas)` seam → call
  `cherryPick(repositoryPath:shas:)` on `Mock`/`LiveMultiCommitService`.
- Insertion-point drop UI + keyboard-reorder mode are ready-made:
  `CommitInsertionPointView`, `KeyboardReorderHintView`,
  `KeyboardReorderSession.confirm(insertionIndex:)` (Task 5's stubbed seams).
- Context menu entries: Squash → `validateSquash` + `buildSquashTodo` +
  `rebaseInteractive(..., action: .squash)`; Reorder → `validateReorder` +
  `buildReorderTodo` + `rebaseInteractive(..., action: .reorder)`.
  `MergeCallToActionWithConflictsView` rebase entry → `RebaseChooseBranchView`
  + `rebase(repositoryPath:baseBranch:targetBranch:)`.
- IMPORTANT: todo-builder `log` input must be scoped to
  `lastRetainedCommitRef..HEAD` (newest-first), like the reference
  `revRange(lastRetainedCommitRef, 'HEAD')` call — unscoped logs duplicate
  history (verified live).

## For Task 7 (sync)
- After a successful rebase/squash/reorder/amend, push uses force-with-lease
  + `Defaults.confirmForcePush` gate (`WarnForcePushView` owns the dialog;
  Task 7 owns the push itself).

## For all tasks
- `MockMultiCommitService` records every op in `recordedOps` — assert on it
  for UI flows (branch/insertion/commit drops each map to exactly one op).
- `LiveMultiCommitService` was verified against a real fixture repo
  (rebase/cherry-pick/squash/reorder/reset all `completedWithoutError` with
  correct history). Streaming progress is NOT wired (`GitProcess` is
  buffer-mode per architecture); `parseRebaseProgressLine` /
  `CherryPickProgressParser` are tested and ready for a future streaming hook.
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).

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
- **Post-merge dedup (Tasks 2–8 on `native`):** several tasks independently
  declared the same top-level names, so the merge renamed the *shell/shell-side*
  twin in each pair. Use the new names — the old ones now belong to the other
  task:
  - `ToolbarPushPullAction` (shell, `Views/Shell/PushPullState.swift`) vs
    Task 7's `PushPullAction` (`Git/Operations/Sync.swift`).
  - `aheadBehindBadgeText(…)` (shell, returns `String?`) vs Task 7's
    `aheadBehindBadge(ahead:behind:tagsToPush:)` (returns `AheadBehindBadge?`).
  - `CherryPickAppProgressParser` (`Git/Progress/MultiCommitAppProgress.swift`,
    emits `AppProgress`) vs Task 6's `CherryPickProgressParser`
    (`Views/Merge/MultiCommitProgress.swift`, returns `MultiCommitProgress`).
  - The Task-2 shell placeholder `FilesChangedBadge` was deleted; the badge is
    Task 3's `FilesChangedBadge` in `Views/Changes/ChangesSidebarView.swift`.
  - The Task-3 placeholder `filterBranches(_:query:)` was deleted; branch
    filtering is Task 5's `filterBranches(_:filterText:)` in
    `Views/Branches/BranchModels.swift`.
  `formatRebaseValue` and the `MultiCommitProgress` value type live only in
  `Views/Merge/`; `Git/Progress/MultiCommitProgress.swift` was renamed to
  `MultiCommitAppProgress.swift`.

## Task 8 → Task 2 (shell: DialogHost / BannerHost / toolbar)
- Task 8 views take explicit props + callbacks and do NOT depend on `AppStore`,
  following the Task 5 pattern. Wire them from `.sheet(item: Popup)`:
  `StashAndSwitchDialog`, `ConfirmOverwriteStashDialog`,
  `ConfirmDiscardStashDialog`, `DeleteTagDialog` (+ `CreateTagForm` in
  `Views/StashTagsWorktrees/TagViews.swift`), `AddWorktreeDialog`,
  `RenameWorktreeDialog`, `DeleteWorktreeDialog`,
  `DeleteWorktreeFailedDialog`, `WarningBeforeResetDialog`,
  `WarnLocalChangesBeforeUndoDialog`, `ConfirmCheckoutCommitDialog`,
  `RevertCommitDialog` (all in `Views/Dialogs/Task8Dialogs.swift`),
  plus `InitializeLFSView` / `LFSAttributeMismatchView`
  (`Views/StashTagsWorktrees/SubmoduleLFSViews.swift`).
- Corresponding `Popup` cases already exist in Task 1 models (no model change
  needed): `.stashAndSwitchBranch`, `.confirmOverwriteStash`,
  `.confirmDiscardStash`, `.createTag`, `.deleteTag`, `.addWorktree`,
  `.renameWorktree`, `.deleteWorktree`, `.deleteWorktreeFailed`,
  `.warningBeforeReset`, `.warnLocalChangesBeforeUndo`,
  `.confirmCheckoutCommit`, `.initializeLFS`, `.lfsAttributeMismatch`.
- "Do not show again" checkboxes in `ConfirmDiscardStashDialog` (→
  `Defaults.confirmDiscardStash`) and `WarnLocalChangesBeforeUndoDialog` (→
  `Defaults.confirmUndoCommit`) persist via `UserDefaults`. `ConfirmCheckoutCommit`
  has a `Defaults.confirmCheckoutCommit` key waiting for the same treatment.
- `StashViewer` (`Views/StashTagsWorktrees/StashViewer.swift`) is the Changes-tab
  stash selection content; `WorktreeList` is the worktree-dropdown content.
  `GitIgnoreEditor` is the Repository Settings → Ignored Files editor (Task 9).

## Task 8 → Task 4 (diff viewer)
- `StashViewer` detail pane is a read-only placeholder (path/status/commitish).
  Swap it for `SeamlessDiffSwitcher` in read-only mode with
  `DiffFileDescriptor(committedFile:)` once Task 4's converter lands (same seam
  as Task 5's `SelectedCommitsView` → `HistoryDiffPlaceholder`).
- `SubmoduleRow.onOpen` currently expects the caller to reveal in Finder via
  `NSWorkspace`. Do not add editor-open or DDS image support (scope bans).

## Task 8 → Task 9 (settings / repo config)
- `GitIgnoreEditor` reads/writes via `GitService.readGitIgnore` /
  `saveGitIgnore` (symlink roots rejected inline). Reuse it for Settings.
- Confirm-pref keys used: `confirmDiscardStash`, `confirmUndoCommit`,
  `confirmCheckoutCommit`, `confirmWorktreeRemoval` (all in
  `Persistence/Defaults.swift`, Task 1).

## For all tasks
- `GitService` now has real Task 8 methods (`LiveGitService` backed by
  `Git/Operations/*`, `MockGitService` in-memory). New operations:
  `stashes/createStash/popStash/dropStash/stashedFiles`, `createTag/deleteTag/
  allTags`, `worktrees/addWorktree/removeWorktree/moveWorktree`, `submodules/
  installLFSHooks/isUsingLFS`, `readGitIgnore/saveGitIgnore`, `undoCommit/
  reset/revertCommit/checkoutCommit`. `tagsToPush` dry-run lives in
  `TagLiveOperations.tagsToPush` (needs Task 7 remote env when surfacing).
- Bug fix worth knowing: `RefsParser.parseWorktrees` split on `"\n\0"` but real
  `git worktree list --porcelain -z` emits `\0\0` between blocks (verified with
  `od -c`, no `\n` at all). Parser now normalizes both; Task 1's
  `ParserTests` fixture (`\n\0`) still passes.
- `StashOperations.totalCount` mirrors the reference `entries.length - 1`
  (1 stash → total 0). Display `entries.count`; `totalCount` is only the
  "non-Desktop stash" signal.
- `createStash` does NOT stage first (reference stages untracked files via
  `stageFiles` before `stash push`). Callers must stage, or only tracked
  modifications are stashed (`stash push` without `-u`).
- `AmendState` (`Git/Operations/UndoResetOperations.swift`) keeps amending only
  while HEAD still matches the target and no conflict flow runs (mirrors
  `repository-state-cache.ts`). Amend *execution* reuses Task 3's commit path
  with `--amend`.
- Tests live in-app (`Tests/Task8Tests.swift`, same `swiftc` harness style as
  `Tests/ParserTests.swift` — no test target; pbxproj is hands-off).
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).

## Task 9 → Task 10 (polish: menus, a11y, Sparkle, Apple Intelligence)

- **New surfaces (all in `Views/Onboarding/`, `Views/Settings/`,
  `Views/Help/`, `Services/`):** `WelcomeView` (Start + ConfigureGit, gated by
  `has-shown-welcome-flow`), `TutorialPanel` + `TutorialWelcome/DoneView` +
  `CreateTutorialRepositoryDialog` + `ConfirmExitTutorialDialog`,
  `SettingsView` (Git / Appearance=Tab Size / Prompts / Advanced /
  Accessibility / Apple Intelligence toggle), `RepositorySettingsView`
  (Remote / Ignored Files / Git Config — Fork tab deleted), `HelpViews`
  (ReleaseNotes, Acknowledgements, Shortcuts, Terms, Logs, MoveToApplications,
  CLIInstalled, InstallingUpdate, InstallGit). `DialogHost` already routes all
  of these from their `Popup` cases — Task 10 only needs to call
  `store.showPopup(...)` from menus.
- **No new `Popup` cases were added** (all Task 9 dialogs reuse Task 1 cases).
  `ShortcutsDialog` takes a `popup` today but has no popup case — rework it to
  a standalone sheet when wiring the Help menu.
- **`MyApp.swift` minimal commands exist** (New/Add/Clone repo, Install CLI,
  Help). Task 10 replaces them with the full native menu per
  `Docs/10-interactions.md` §1 — keep the Task 9 actions, do not drop them.
- **Deeplink is parsed but not registered:** `DeepLinkService` handles
  `x-gitdesktop-client://openrepo/...` (OAuth variant dropped) and `MyApp`
  has `.onOpenURL`, but there is no `CFBundleURLTypes` entry (no Info.plist in
  the synced group; needs a pbxproj-adjacent change). Register the scheme in
  Task 10.
- **Settings scene caveat:** the native `Settings` scene hosts `SettingsView`
  with a synthetic `.preferences` popup, so Save closes the popup stack but
  does NOT close the Settings window. Fix in Task 10 (dismiss via
  `@Environment(\.dismiss)` instead of `store.closePopup` in that host).
- **Persistence is UserDefaults JSON** (`Persistence/RepositoryPersistence.swift`,
  path/id/alias/tutorial flag only). Task 10 decides GRDB vs SwiftData — migrate
  this file then; callers only use `save`/`load`/`nextID`/`matchExisting`.
- **`GitIgnoreEditor` (Task 8) was NOT reused:** `RepositorySettingsView` has its
  own `TextEditor` + `LiveGitService.readGitIgnore`/`saveGitIgnore` (CRLF-aware
  formatting lives in `GitIgnoreOperations`). Unify if desired.
- **Clone UX:** `CloneRepositoryDialog` clones inline with its own progress bar;
  the `CloningRepository` selection / `CloningRepositoryView` cancel path is
  unwired (Cancel there only clears the banner). Wire cancellation through a
  clone dispatcher if Task 10 wants it.
- **`AboutDialog` (Task 2) now links to Acknowledgements + Release Notes.**
  The old `AcknowledgementsDialog` stub in `DialogHost.swift` is dead code
  (`.acknowledgements` routes to `AcknowledgementsFullDialog`) — delete it.
- **Tests:** `Tests/Task9Tests.swift` (12 groups, same harness style). Run via:
  `xcrun swiftc -module-name GitDesktop $(find GitDesktop/GitDesktop -name
  "*.swift" ! -name "MyApp.swift" | sort | tr '\n' ' ') <harness-main.swift>
  -o /tmp/task9tests && /tmp/task9tests` (needs `-module-name GitDesktop`;
  `ShellTests` + `Task9Tests` are non-isolated, the rest need a MainActor
  context). Two compiler-crash gotchas fixed here, do not reintroduce:
  `if let x` shadowing an `@State var x` while assigning `x = …` inside the
  closure crashes swift-frontend — bind to a different name (`lockPath`).
  `try? await … ?? try? await …` is illegal (`??` RHS is a sync autoclosure) —
  split into separate `let`s first.
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).

## Task 10 — polish follow-ups (no later PLAN tasks; pick up as needed)

- **Sparkle drop-in:** `Services/UpdateService.swift` implements the full
  state machine (check → available → downloading → installing →
  installedPendingRestart) against a Sparkle-format appcast (`feedURL` is nil
  in dev, so checks stay local; `simulatedRemoteVersion` drives UI testing).
  Adding the real Sparkle SPM package needs a `project.pbxproj` edit (banned
  while the group is filesystem-synced) — when that happens, forward
  `SPUUpdater` states into `UpdateService.state`; the banner (`BannerHost` +
  `UpdateBannerHost`), showcase (Release Notes popup), `InstallingUpdate`
  quit-guard, and Check-for-Updates menu stay as-is.
- **FoundationModels streaming:** `AppleIntelligenceService` gates correctly
  (`#available(macOS 26, *)` + `canImport(FoundationModels)` + Settings
  toggle) and the UI flow (disclaimer → overwrite warning → stream →
  cancel/regenerate) works end to end, but `streamFoundationModel` /
  `runFoundationModel` are deterministic placeholders — replace their bodies
  with `LanguageModelSession.streamResponse` / `respond` when the SDK is
  linked. Keep the Explain-only contract (no file writes, no auto-apply).
- **`AIAvailability` is intentionally NOT `Equatable`:** with the target's
  `-default-isolation=MainActor` + `InferIsolatedConformances`, a synthesized
  `==` infers as MainActor-isolated and breaks nonisolated use (Swift 6
  error). Test via `isAvailable` + `case` matching. Same trap applies to any
  new associated-value enum compared off the main actor.
- **`Popup.shortcuts` is new** (Task 10): `ShortcutsDialog` content already
  existed in `HelpViews.swift`; the menu Help > Keyboard Shortcuts now shows
  it instead of Release Notes. Keep `shortcutRows` in sync with
  `requiredMenuAccelerators` in `App/Commands.swift` (covered by
  `Task10Tests.testMenuInventory`).
- **Menu → view wiring** is via `GitDesktopMenuAction` notifications:
  `RepositoryView` observes tab switches, `TextDiffView` observes Find /
  Select All. Push/pull/fetch menu items post notifications — whoever owns
  sync next should subscribe (same for stash-all/update-from-default/merge/
  rebase/compare/create-tag, which currently have no subscriber).
- **Tests:** `Tests/Task10Tests.swift` (10 groups). Run via the harness file
  list in this session (needs `-module-name GitDesktop`; entry file must be
  named `main.swift`): Models + Persistence + GitService + Operations +
  Progress (minus `MultiCommitAppProgress.swift`, which needs
  `formatRebaseValue` from `Views/Merge`) + ChangesLogic + Accessibility +
  AppState + AppStore+Onboarding + Commands + CLIService + UpdateService +
  AppleIntelligenceService + CrashReporter + HelpViews + Task10Tests.
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).
- No GH / editor / Copilot / theme / notification code anywhere (scope bans).
