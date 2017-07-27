import { Repository } from '../models/repository'

/** The types of actions that can be retried. */
export const enum RetryActionType {
  Push = 1,
}

/** The retriable actions. */
export type RetryAction = { type: RetryActionType.Push; repository: Repository }
