# TODO — cross-task handoff notes

Running notes for later PLAN.md tasks. Append, don't rewrite history.

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
