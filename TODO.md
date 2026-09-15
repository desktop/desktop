# TODO.md — cross-task handoff notes (Task 6)

Task 6 (branch `task/6-rebase-cherry-pick`) added rebase / cherry-pick /
squash / reorder git operations + commit drag-drop. Source of truth for
behavior remains `GitDesktop/Docs/07-branches-operations.md` §2 and
`GitDesktop/Docs/10-interactions.md` §4.

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
