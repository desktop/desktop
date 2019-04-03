import { IRebaseProgress } from './progress'
import { ComputedAction } from './computed-action'
import { CommitOneLine } from './commit'

export type RebaseContext = {
  readonly targetBranch: string
  readonly baseBranchTip: string
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

/** Represents a snapshot of a Git rebase operation as shown to the user */
export type GitRebaseProgress = {
  /** A numeric value between 0 and 1 representing the percent completed */
  readonly value: number
  /** The current number of commits rebased as part of this operation */
  readonly rebasedCommitCount: number
  /** The commit summary associated with the current commit (if found) */
  readonly currentCommitSummary?: string
  /** The list of known commits that will be rebased onto the base branch */
  readonly commits: ReadonlyArray<CommitOneLine>
}
