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
