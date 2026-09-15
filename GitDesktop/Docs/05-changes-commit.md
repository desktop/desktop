# 05 — Changes Tab + Commit Box

## 1. Changes sidebar (`changes/sidebar.tsx`, `filter-changes-list.tsx`, `filter-changes-logic.ts`)

`ChangesSidebar → FilterChangesList`: virtualized working-dir list + `CommitMessage` pinned bottom + `UndoCommit` slide (500ms). Props: `workingDirectory{files,selection}, conflictState, stashEntry, fileListFilter, showChangesFilter, allowEmptyCommit/skipCommitHooks/signOffCommits`.
Rows (`changed-file.tsx`): tri-state checkbox (On/Off/Mixed for partial, tabIndex -1) + `PathLabel` (truncated, match highlight) + status octicon (`iconForStatus`, classes `status-*`: New/Modified/Deleted/Renamed/Copied/Conflicted/Untracked) + tooltip + live-region "path status included". Click select; `Space/Enter` toggles include; context menu: Discard changes… / Ignore file (add to .gitignore) / Ignore extension / Reveal in Finder / Copy path. DELETE Open-in-editor/default-app items.
Filter: toggle (`showChangesFilter`, default true) text box + options popover (Included/Excluded in commit, New/Modified/Deleted). Bottom stash row (if `stashEntry`): "View stash" → switches selection to stash.
Also: `FilesChangedBadge` count pill on Changes tab; `OversizedFilesWarning` LFS gate (`filesNotTrackedByLFS`, `getLargeFilePaths`); `CommitWarning` yellow/red (protected→replace with local: detached/merge-conflict/unpushed rules); `ContinueRebase` CTA when rebase conflict; `ConfirmCommitFilteredChanges` when filter hides files to commit.

## 2. Commit box (`changes/commit-message.tsx` ~1600 lines — replicate fully minus GH/Copilot)

Layout top→bottom: avatar (initials) + branch + warnings; summary `TextField` + description `TextEditor` in one `FocusContainer` frame; `AuthorInput` co-authors (make always available, not GH-gated); action bar (co-author toggle, gear commit-options, Apple Intelligence generate/cancel — replaces Copilot button); submit `Commit to <branch>` (`Commit N files to …`), spinner, live-region.
Behaviors:
- `Cmd/Ctrl+Enter` commits (if focus in wrapper and no modal/foldout).
- Validation blocks commit: no files + !allowEmpty, conflict markers, repo-rule fail; warnings don't block (length>72 summary → warn if `showCommitLengthWarning`, disallowed email → quick fix "set global email", misattribution).
- `canCommit/canAmend`, amend notice + Stop amending, squash reuse (`commitButtonText/dialogTitle` via `CommitMessage` popup).
- Context menu: Add/Remove Co-Authors, spellcheck toggle.
- `RepoRulesMetadataFailureList` popover anchored to summary (keep local git-side checks; drop GH rulesets fetch — show only `commitMessagePatterns` if configured locally, else hide).
- Unknown co-author confirm, filtered-files confirm, LFS oversized confirm, conflicts confirm (`CommitConflictsWarning`).
- Autocomplete (`autocompletion/*`): keep branch (`#`→branch? actually `#` was issues — DELETE issues provider), keep `@` for co-authors (local authors, not GH users), keep `:emoji:` + emoji map, keep branch-name provider. Popup list, keyboard nav. Delete `issues-autocompletion-provider.tsx`.
- Spellcheck: `commitSpellcheckEnabled(true)` + `NSSpellChecker`, toggle in menu + commit-box menu.
- Options (gear `Menu`): `skipCommitHooks (--no-verify)`, `signOffCommits (--signoff → Signed-off-by:)`, `allowEmptyCommit (--allow-empty, resets after commit)`.
- `CommitProgress` sheet: streaming hook/commit output + View progress; `HookFailed` sheet: abort/ignore per hook.
- `GenerateCommitMessageOverrideWarning`: keep pattern, rewire to Apple Intelligence ("Replace typed message?").

## 3. Stash entry row + viewer (see also §07)

Bottom bar "Stash: <branch> (N files) — View stash / Hide". `StashDiffViewer` = readOnly `SelectedCommits`-like: `StashDiffHeader` (message/date, Restore/Discard) + resizable FileList + diff. Confirms: discard stash (if pref), overwrite on switch.
