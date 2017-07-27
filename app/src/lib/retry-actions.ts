import { Repository } from '../models/repository'

export const enum RetryActionType {
  Push = 1,
}

export type RetryAction = { type: RetryActionType.Push; repository: Repository }
