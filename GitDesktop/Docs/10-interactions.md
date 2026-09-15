# 10 — Menus, Shortcuts, Context Menus, Drag-and-Drop, Empty States, A11y

## 1. Native menu (macOS `commands`; prune GH/editor items)

Keep ids/accelerators (from `main-process/menu/build-default-menu.ts`):
File: New Repository `Cmd+N`, Add Local `Cmd+O`, Clone `Cmd+Shift+O` | Edit: Undo/Redo/Cut/Copy/Paste/Select All (standard) | View: Changes `Cmd+1`, History `Cmd+2`, Repository List `Cmd+T`, Branches `Cmd+B`, Toggle Full Screen, zoom `Cmd+0/=/−`, Show Commit Box `Ctrl+H`? (verify: `Ctrl+H/L` focus lists) | Repository: Push `Cmd+P`, Pull `Cmd+Shift+P`, Fetch, Remove `Cmd+Backspace`?, View in Finder `Cmd+Shift+F`?, Open in Terminal→DELETE, Show in Finder keep, Repository Settings `Cmd+,`? (actually Settings `Cmd+,`) | Branch: New `Cmd+Shift+N`, Rename, Delete, Discard All Changes, Update from Default, Merge into Current, Rebase Current onto…, Compare, Create Tag | Window/Help: About, Settings `Cmd+,`, Install CLI…, Help (guides/shortcuts/logs), Show Release Notes.
Delete: Preview/Create Pull Request `Cmd+R`, Open in editor `Cmd+Shift+A`, View/Create Issue/Branch on GitHub, Compare on GitHub.
In-app Alt-menu nav is Windows-only — skip; keep `Shift+F10`→context menu synthesis out (AppKit provides it).

## 2. In-app shortcuts

`Ctrl+Tab` Changes↔History; `Cmd+Enter` commit (in commit box, no modal); `Cmd+F` diff find; `Cmd+A` select-all (List hijacks via custom event); `←→` tab nav; `Space/Enter` toggle include; `↑↓Enter/Esc` in filter lists; `Home/End/PgUp/Dn` in lists; resizable `⌘+/-` (±5px) + dbl-click reset; drag-hover tab switch 500ms (`dragTabSwitchWaitTime`).

## 3. Context menus (all via `showContextualMenu` → `NSMenu`)

- Repo list: Show in Finder | Change/Remove alias | Create worktree… | Remove… (DELETE Open-in-shell/editor, View on GitHub).
- Branch button/list: Rename…/Delete… (+Checkout in new worktree… in list).
- Commit list single/multi (§06). File lists (changes/history/stash): Discard…/Ignore file/extension (changes only)/Reveal in Finder/Copy path(s) (+Discard line/hunk in diff gutter/text + Select All/Copy).
- Commit box: Add/Remove Co-Authors, spellcheck toggle, (Apple Intelligence generate — button not menu).
- Diff: Copy/Select All/Discard line(s)/Expand hunk.
- Stash header: Restore/Discard. Worktree list: Rename/Delete/Reveal.

## 4. Drag-and-drop (must replicate all)

- OS → window (`App.componentDidMount`): `ondragover` copy (none if modal), `ondrop`: >1 paths → `addRepositories` + select first; 1 → toplevel resolve → match existing else `AddRepository{path}`. Dock drop + `openFile` folders-only (`stat`, ignore files). Implement: `DropDestination` on root + `application(_:openFile:)`.
- Commits in-app (`models/drag-drop.ts`): `DragType.Commit` only; `DragData{commits}`, ghost `CommitDragElement{commit,selectedCommits}` (drop GH field). Targets: `Branch (.branches-list-item)` → cherry-pick; `Commit (.commit)` → (hover opens branch dropdown); `ListInsertionPoint (.list-insertion-point)` → reorder/squash with contiguity + merge-commit guards + keyboard-reorder alternative + metrics (`cherryPickViaDragAndDrop`, cancel count — keep locally, no upload). Branch-dropdown auto-opens on hover during drag.
- No file-content drops (only repo folders + commits).

## 5. Empty states (illustrations + actions)

No-changes (`no-changes.tsx`): suggested actions w/ menu shortcuts (open Finder? → Show in Finder; create branch; etc.). Multi-selection "N files selected". No-commit-selected + noncontiguous hints (`empty-no-commit.svg`). No-branches, No-remote (`no-remote.tsx` → add remote), Large-diff gate (`ufo-alert.svg`), Empty-file/renamed/whitespace/conflict states (§06), Missing-repo, No-repos (§04), Tutorial welcome/done.

## 6. Accessibility

Semantic sheets (`alertdialog` where destructive), `aria-label` on virtualized rows → SwiftUI `accessibilityLabel/Value/Hint`; live-regions → `.accessibilityLiveRegion(.polite)` (commit progress, find "N of M", resize %, include toggles); keyboard-operable menus/lists (§2); `underlineLinks` (default true) + `showDiffCheckMarks` (default true) prefs; spellcheck + `NSSpellChecker` menu; zoom via `NSWindow` + `Dynamic Type` (replaces `windowZoomFactor` steps `[0.67..2]`); native theme sync (no custom theme); focus tracking (`appIsFocused`, dock bounce/flash on dialog → `NSApp.requestUserAttention`); VoiceOver for diff rows (line numbers + add/delete semantics).
