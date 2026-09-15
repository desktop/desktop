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
