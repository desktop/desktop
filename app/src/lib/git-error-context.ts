import { Tip } from '../models/tip'

type MergeErrorContext = {
  kind: 'merge'
  /** The tip of the repository at the time of the merge operation */
  readonly tip?: Tip
  /** the branch passed to Git as part of the merge operation */
  branch: string
}

type PullErrorContext = {
  kind: 'pull'
}

/** A custom shape of data for actions to provide to help with error handling */
export type IGitErrorContext = MergeErrorContext | PullErrorContext
