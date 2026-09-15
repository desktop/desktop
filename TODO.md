# TODO — cross-task handoff notes

Running notes for later tasks. Each task appends its integration contracts here.

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
