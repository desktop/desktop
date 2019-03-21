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
  start: number
  /** The number of commits to be rebased as part of the operation */
  total: number
  /** The callback to fire when rebase progress is reported */
  progressCallback: (progress: IRebaseProgress) => void
}

export type RebaseSuccess = {
  readonly kind: ComputedActionKind.Clean
  readonly commits: ReadonlyArray<Commit>
}

export type RebaseConflicts = {
  readonly kind: ComputedActionKind.Conflicts
  readonly conflictedFiles: number
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
