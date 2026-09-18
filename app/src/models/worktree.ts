import * as Path from 'path'
import { shortenSHA } from './commit'
import { Branch } from './branch'
import { UncommittedChangesStrategy } from './uncommitted-changes-strategy'

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
 * What a worktree removal was asked to do beyond `git worktree remove`.
 * Carried through the confirmation and failure dialogs so a retry keeps it.
 */
export interface IDeleteWorktreeOptions {
  /** The worktree's folder was gone when removal was offered. */
  readonly isMissing?: boolean
  /** Branch held by the worktree, to check out once it's been removed. */
  readonly checkout?: {
    readonly branch: Branch
    readonly strategy?: UncommittedChangesStrategy
  }
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
