import { IRebaseProgress } from './progress'
import { ComputedAction } from './computed-action'
import { CommitOneLine } from './commit'

/**
 * Rebase internal state used to track how and where the rebase is applied to
 * the repository.
 */
export type RebaseInternalState = {
  /** The branch containing commits that should be rebased */
  readonly targetBranch: string
  /**
   * The commit ID of the base branch, to be used as a starting point for
   * the rebase.
   */
  readonly baseBranchTip: string
  /**
   * The commit ID of the target branch at the start of the rebase, which points
   * to the original commit history.
   */
  readonly originalBranchTip: string
}

/**
 * Options to pass in to rebase progress reporting
 */
export type RebaseProgressOptions = {
  /** The number of commits already rebased as part of the operation */
  rebasedCommitCount: number
  /** The number of commits to be rebased as part of the operation */
  totalCommitCount: number
  /** The callback to fire when rebase progress is reported */
  progressCallback: (progress: IRebaseProgress) => void
}

export type CleanRebase = {
  readonly kind: ComputedAction.Clean
  readonly commits: ReadonlyArray<CommitOneLine>
}

export type RebaseWithConflicts = {
  readonly kind: ComputedAction.Conflicts
}

export type RebaseNotSupported = {
  readonly kind: ComputedAction.Invalid
}

export type RebaseLoading = {
  readonly kind: ComputedAction.Loading
}

export type RebasePreview =
  | CleanRebase
  | RebaseWithConflicts
  | RebaseNotSupported
  | RebaseLoading

/** Represents the progress of a Git rebase operation to be shown to the user */
export type GitRebaseProgress = {
  /** A numeric value between 0 and 1 representing the percent completed */
  readonly value: number
  /** The current number of commits rebased as part of this operation */
  readonly rebasedCommitCount: number
  /** The commit summary associated with the current commit (if found) */
  readonly currentCommitSummary: string | null
  /** The count of known commits that will be rebased onto the base branch */
  readonly totalCommitCount: number
}

/** Represents a snapshot of the rebase state from the Git repository  */
export type GitRebaseSnapshot = {
  /** The sequence of commits that are used in the rebase */
  readonly commits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: GitRebaseProgress
}
