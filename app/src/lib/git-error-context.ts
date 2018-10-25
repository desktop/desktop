import { Tip } from '../models/tip'

export type MergeConflictsErrorContext = {
  /** The Git operation that triggered the conflicted state */
  readonly kind: 'merge' | 'pull'
  /** The tip of the repository at the time of the merge operation */
  readonly tip?: Tip
  /** The branch currently being merged into the current branch, "their" in Git terminology */
  readonly theirBranch: string
}

/** A custom shape of data for actions to provide to help with error handling */
export type IGitErrorContext = MergeConflictsErrorContext
