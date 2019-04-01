import { IRebaseProgress } from './progress'
import { ComputedActionKind } from './action'
import { Commit } from './commit'

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

export type RebaseSuccess = {
  readonly kind: ComputedActionKind.Clean
  readonly commits: ReadonlyArray<Commit>
}

export type RebaseConflicts = {
  readonly kind: ComputedActionKind.Conflicts
}

export type RebaseUnsupported = {
  readonly kind: ComputedActionKind.Invalid
}

export type RebaseLoading = {
  readonly kind: ComputedActionKind.Loading
}

export type RebasePreviewResult =
  | RebaseSuccess
  | RebaseConflicts
  | RebaseUnsupported
  | RebaseLoading

export type RebaseProgressSummary = {
  /** A numeric value between 0 and 1 representing the rebase progress */
  readonly value: number
  /** Track the current number of commits rebased across dialogs and states */
  readonly rebasedCommitCount: number
  /** Track the total number of commits to rebase across dialog and states */
  readonly totalCommitCount: number
  /** The commit summary associated with the current commit (if known) */
  readonly commitSummary?: string
}
