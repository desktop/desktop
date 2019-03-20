import { IRebaseProgress } from './progress'

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
