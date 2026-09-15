# 06 — History Tab + Diff Viewer

## 1. Compare sidebar (`history/compare.tsx`)

`FancyTextBox` branch filter (branch icon, clear) + either `BranchList` (when `showBranchList`) or commit list. Modes: History (current branch log) vs Compare (`TabBar Behind(N)/Ahead(N)` + `CommitList` + `MergeCallToAction`). Infinite scroll (threshold 10 → `loadNextCommitBatch`). `Enter` executes compare, `Esc` clears, `↑/↓` moves. Handles cherry-pick/squash/reorder/undo/reset/checkout/create-branch/tag/delete-tag callbacks. Delete PR-related merge CTA variants; keep plain Merge button + conflicts variant (`merge-call-to-action*.tsx` minus GH).
SwiftUI: search field + segmented Behind/Ahead + list + sticky merge CTA.

## 2. Commit list (`history/commit-list.tsx` 1000+ lines — replicate)

`RowHeight 50`. Row: avatar stack (initials), summary, author + date (system formatters — delete `preferAbsoluteDates` toggle, always show relative + tooltip absolute), tags, unpushed `↑`. Virtualized multi-select (`List`, Shift/Cmd, Home/End/PgUp/Dn). Drag source (`DragType.Commit`, `.draggable`, ghost `CommitDragElement`); drop insertion (contiguity check, merge-commit guard) for reorder/squash; keyboard reorder mode with hint popover (`↑/↓ + Enter/Esc`, live-region). Context menus — single: Amend this commit / Undo commit / Reset to commit… / Checkout commit… / Reorder… / Revert / Create branch from commit… / Create tag… / Delete tag… (submenu if multi-tag, disabled if pushed) / Cherry-pick… / Copy SHA; multi: Cherry-pick N… / Squash N… / Reorder N…. Tooltip: authors, full date, unpushed reason. `shasToHighlight` flash. Delete `View on GitHub`.
`UnreachableCommitsDialog`: orphaned commits browser (keep, tabbed).

## 3. Selected commits (`history/selected-commits.tsx`, `expandable-commit-summary.tsx`, `file-list.tsx`)

`#history.collapsed|expanded`: `ExpandableCommitSummary` (avatars, summary/description, SHAs + copy, co-authors, expand) + `commit-details`: `Resizable(fileList)` (`N changed files` header + `FileList`) + `diff-container(DiffHeader+SeamlessDiffSwitcher readOnly)`. Multi-noncontiguous → blankslate `empty-no-commit.svg` + hints. Drag overlay during commit drag. File context menu: Reveal in Finder, Copy paths. Delete `View on GitHub`, Open-in-editor.
File rows (`committed-file-item.tsx`): like changes rows but no checkbox; dbl-click = show in Finder (replaces open-in-editor).

## 4. Diff viewer (`diff/*` — replicate fully)

`Diff` switches `Text|LargeText|Binary|Image|Submodule|Unrenderable`. Empty states: file empty / renamed-no-change / renamed+modified / conflict-must-resolve / only-whitespace / no-content / large-file gate (`ufo-alert.svg` + Show Diff).
`SeamlessDiffSwitcher`: async `fileContents` + renderer pick. Syntax highlight async (CodeMirror modes → Swift: Splash/Highlightr or TextKit2 custom; token colors from §03).
`SideBySideDiff` (1754 lines): virtualized (`LazyVStack` + `NSTableView` for 10k+ lines), unified vs side-by-side (`showSideBySideDiff`), gutter checkboxes per hunk + hover hunk, drag-select lines (temp selection, one-column text selection), hunk expand (`expandTextDiffHunk/WholeFile`, focus restore), `Cmd+F` find bar (`DiffSearchInput`: next/prev, highlight, live-region "Result N of M"), `Cmd+A` select-all, copy/select-all menus, discard line/hunk menus (`Discard added/removed/modified line(s)…` → `ConfirmDiscardSelection` or direct), `DiffContentsWarning` (hidden bidi, CRLF/LF), `WhitespaceHintPopover`, `DiffHeader` (PathLabel + status + gear: Hide whitespace, Split/Unified; hidden for submodule), `BinaryFile` (+ Open with default → replace with Reveal), `SubmoduleDiff` (SHA + Open submodule via `open`).
`DiffOptions` gear popover per pane (hide-whitespace changes/history). Row height 20, line-number col 50px.
Images (`image-diffs/*`): `ModifiedImageDiff` switch 2-up/Swipe/Onion/Difference + aspect-fit (`getMaxFitSize`), sliders for swipe/onion, New/Deleted single. DDS conversion keep if cheap else drop `.dds` (flag-gated originally).
