# TODO.md — cross-task handoff notes

Running notes for later tasks. Each entry names the owning task and the seam
Task 5 left for it. Source of truth for behavior remains `GitDesktop/Docs/`.

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
