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

/** A checkout to run once the worktree holding its branch has been removed. */
export interface IDeferredCheckout {
  readonly branch: Branch
  readonly strategy?: UncommittedChangesStrategy
}

/**
 * How a worktree is to be removed. Carried through the confirmation and
 * failure dialogs so a retry keeps it.
 */
export interface IDeleteWorktreeOptions {
  readonly force?: boolean
  /** The worktree's folder was gone when removal was offered. */
  readonly isMissing?: boolean
  readonly checkout?: IDeferredCheckout
}

/** The display name for a worktree (the basename of its path). */
export function getWorktreeDisplayName(
  worktree: WorktreeEntry,
  separator?: string
): string {
  const windows = separator
    ? separator === String.fromCharCode(92)
    : /^[A-Za-z]:[\\/]/.test(worktree.path) ||
      worktree.path.startsWith(String.fromCharCode(92).repeat(2))
  const trimmed = worktree.path.replace(windows ? /[\\/]+$/ : /\/+$/, '')
  if (windows && /^[A-Za-z]:$/.test(trimmed)) return ''
  return trimmed.split(windows ? /[\\/]/ : /\//).pop() || ''
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

/** The accessible name for a worktree list row. */
export function getWorktreeAriaLabel(
  worktree: WorktreeEntry,
  separator?: string
): string {
  const missing = worktree.isPrunable ? ', missing' : ''
  return `${getWorktreeDisplayName(
    worktree,
    separator
  )}${missing}, ${getWorktreeDescription(worktree)}`
}
