import { Repository } from './repository'
import { CloneOptions } from './clone-options'

/** The types of actions that can be retried. */
export enum RetryActionType {
  Push = 1,
  Pull,
  Fetch,
  Clone,
}

/** The retriable actions and their associated data. */
export type RetryAction =
  | { type: RetryActionType.Push; repository: Repository }
  | { type: RetryActionType.Pull; repository: Repository }
  | { type: RetryActionType.Fetch; repository: Repository }
  | {
      type: RetryActionType.Clone
      url: string
      path: string
      options: CloneOptions
    }
