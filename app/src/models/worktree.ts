import * as Path from 'path'
import { shortenSHA } from './commit'

export type WorktreeType = 'main' | 'linked'

export type WorktreeEntry = {
  readonly path: string
  readonly head: string
  /** Full ref name (e.g. `refs/heads/main`), or `null` when HEAD is detached */
  readonly branch: string | null
  readonly isDetached: boolean
  readonly type: WorktreeType
  readonly isLocked: boolean
  readonly isPrunable: boolean
}

/**
 * The worktrees that can actually be switched to.
 *
 * Git keeps reporting a worktree after its working directory has been deleted,
 * flagged prunable, until something prunes it. There's nothing to switch to in
 * that state, so those entries are filtered out rather than offered.
 *
 * This is deliberately not applied to the worktree list held in repository
 * state, which is also used to detect that a branch is checked out in another
 * worktree — git considers a branch taken by a prunable worktree to still be in
 * use, so it has to keep counting for that purpose.
 */
export function getSwitchableWorktrees(
  worktrees: ReadonlyArray<WorktreeEntry>
): ReadonlyArray<WorktreeEntry> {
  return worktrees.filter(w => !w.isPrunable)
}

/** The display name for a worktree (the basename of its path). */
export function getWorktreeDisplayName(worktree: WorktreeEntry): string {
  return Path.basename(worktree.path)
}

/**
 * The display description for a worktree: its branch name (without the
 * `refs/heads/` prefix) or a shortened HEAD SHA when HEAD is detached.
 */
export function getWorktreeDescription(worktree: WorktreeEntry): string {
  return worktree.branch
    ? worktree.branch.replace(/^refs\/heads\//, '')
    : shortenSHA(worktree.head)
}
