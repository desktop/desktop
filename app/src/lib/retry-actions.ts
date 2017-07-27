import { Repository } from '../models/repository'

/** The types of actions that can be retried. */
export enum RetryActionType {
  Push = 1,
  Pull,
  Fetch,
}

/** The retriable actions. */
export type RetryAction =
  | { type: RetryActionType.Push; repository: Repository }
  | { type: RetryActionType.Pull; repository: Repository }
  | { type: RetryActionType.Fetch; repository: Repository }
