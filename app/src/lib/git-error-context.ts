import { Tip } from '../models/tip'

type MergeConflictsErrorContext = {
  /** The Git operation that triggered the conflicted state */
  readonly kind: 'merge' | 'pull'
  /** The tip of the repository at the time of the merge operation */
  readonly tip?: Tip
  /** the branch passed to Git as part of the merge operation */
  readonly branch: string
}

/** A custom shape of data for actions to provide to help with error handling */
export type IGitErrorContext = MergeConflictsErrorContext
