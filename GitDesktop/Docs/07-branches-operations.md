# 07 — Branches, Multi-Commit Ops, Conflicts, Stash, Tags, Worktrees

## 1. Branches (`branches/*` minus PR/CI)

`BranchesContainer`: `FancyTextBox` filter + `BranchList` + footer `Merge into <current>…`. Groups `Recent|Default|Other`, `canCreateNewBranch` row, `RowHeight` ~30, `↑↓Enter/Esc`, `hideFilterRow` during commit-drag. Drag commits → `New Branch` drop row + per-branch drop (cherry-pick). Row: name, ahead/behind, context menu (Rename…/Delete…/Checkout in new worktree…). Delete: PRs tab + count bubble, PR badge/list/item, `pull-request-quick-view`, `ci-status` + `check-runs/*`, `push-branch-commits` (GH push confirm — keep local force-push confirms only).
Dialogs: Create (`create-branch-dialog`: name validation + start point + default-branch hint), Rename (`rename-branch-dialog` + case-only retry), Delete (local + `existsOnRemote` → also-delete-remote checkbox → `push <r> :<b>` + `deleteRef` fallback).

## 2. Multi-commit operations (`multi-commit-operation/*`, `choose-branch/*`, `dialog/*`)

Wizard: choose-branch (`base/merge/rebase-choose-branch-dialog`, target picker + commits preview + force-push warning) → progress (`progress-dialog`, cancellable, per-commit `IMultiCommitOperationProgress{position,total,currentSummary}`) → conflicts (`conflicts-dialog`) → result banner (+Undo). Delete `copilot-conflicts-*` (replace with Explain-only per `01-scope.md` if desired).
Ops:
- Merge (`merge.tsx`): `merge [--squash] [--no-verify]` → Success|AlreadyUpToDate|Failed; squash path extra `commit --no-edit`; `abortMerge`; `determineMergeability` via `merge-tree --write-tree`; success/uptodate/conflict banners.
- Rebase (`rebase.tsx`, `base-rebase.tsx`): `rebase -- <base> <target>` (+`rebase.backend=merge`); `abort/continue` (stage + `REBASE_HEAD` check + `--skip` if clean else `--continue`, `GIT_EDITOR=:`); `confirm-force-push` (with lease) after success; `rebase-conflicts-banner` + `continue-rebase` CTA in Changes.
- Cherry-pick (`cherry-pick.tsx`): `<shas> --empty=keep -m 1` (expected MergeConflicts/ModifyDeleted); `continue` (stage + `CHERRY_PICK_HEAD` → `commit --allow-empty` if empty else `--continue`); `abort`; snapshot from `.git/sequencer/*`; banners + undo (`undoSha`).
- Squash (`squash.ts`) / Reorder (`reorder.ts`): temp todo (`pick/squash`) via `getTempFilePath` → `rebaseInteractive` (`-c sequence.editor=cat todo > rebase [-i] [--no-verify] ref|--root`); guards: contiguity irrelevant (non-contiguous allowed), merge-commit guard; result banners + undo. Entry: commit-list context menu, drag-insertion drop, keyboard reorder mode.
- Common: `base-multi-commit-operation` commits list + `warn-force-push-dialog` + `confirm-abort-dialog` (if `userHasResolvedConflicts`).

## 3. Conflicts (`lib/conflicts/*`, `merge-conflicts/*`, `banners/*conflicts*`)

`UnmergedFile` rows: markers type (`N conflicts` + `▾` → Reveal in Finder / Use ours (`checkout --ours`) / Use theirs (`--theirs`)) vs manual (Resolve `▾`, deleted handling) vs resolved (green check + Undo). First row `dialog-preferred-focus`. `commit-conflicts-warning`: block commit with markers. `render-functions.tsx` shared row renderers. Banners reopen dialog. Manual resolutions map `path → {ours,theirs}` applied before continue/commit.

## 4. Undo / reset / revert

- Undo commit: most-recent local only (no tags, not amending) + confirm pref + `WarnLocalChangesBeforeUndo` if dirty.
- Reset (`reset/warning-before-reset`): to commit, mode radio Soft/Mixed/Hard + confirm.
- Revert (`revert.ts`): `revert [-m 1]` + LFS progress button.
- Amend: `start/stopAmending`, commit box amend notice, `createCommit(amend:true)`.

## 5. Stash / tags / worktrees / submodules / LFS (UI)

- Stash (`stashing/*`, `stash-changes/*`): viewer (§05) + Restore/Discard + `confirm-discard-stash` + `stash-and-switch-branch-dialog` (bring changes?) + `overwrite-stashed-changes-dialog`.
- Tags (`create-tag/delete-tag`): create (name+commit, unpushed indicator, `tag -a -m ''`), delete (guard if pushed).
- Worktrees (`worktrees/*`): list grouped Main|Linked (row 30, filter, New…), click switches (seed/transfer state), menu Rename/Delete/Reveal; dialogs validate path/branch; `delete-worktree-failed-dialog` on error.
- Submodules/LFS (`diff/submodule-diff`, `lfs/*`): submodule row (SHA + Open); `initialize-lfs` prompt + `attribute-mismatch` warning.
