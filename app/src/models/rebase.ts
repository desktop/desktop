import { IMultiCommitOperationProgress } from './progress'
import { ComputedAction } from './computed-action'
import { CommitOneLine } from './commit'
import { Branch } from './branch'

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
  commits: ReadonlyArray<CommitOneLine>
  /** The callback to fire when rebase progress is reported */
  progressCallback: (progress: IMultiCommitOperationProgress) => void
}

interface ISupportedRebaseInfo {
  readonly baseBranch: Branch
  readonly commits: ReadonlyArray<CommitOneLine>
}

export type CleanRebase = {
  readonly kind: ComputedAction.Clean
} & ISupportedRebaseInfo

export type RebaseWithConflicts = {
  readonly kind: ComputedAction.Conflicts
} & ISupportedRebaseInfo

export type RebaseNotSupported = {
  readonly kind: ComputedAction.Invalid
  readonly baseBranch: Branch
}

export type RebaseLoading = {
  readonly kind: ComputedAction.Loading
  readonly baseBranch: Branch
}

export type RebasePreview =
  | CleanRebase
  | RebaseWithConflicts
  | RebaseNotSupported
  | RebaseLoading

/** Represents a snapshot of the rebase state from the Git repository  */
export type GitRebaseSnapshot = {
  /** The sequence of commits that are used in the rebase */
  readonly commits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: IMultiCommitOperationProgress
}
