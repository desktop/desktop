import { Repository } from '../models/repository'
import { CloningRepository } from '../models/cloning-repository'
import { RetryAction } from './retry-actions'
import { Tip } from '../models/tip'

type MergeErrorContext = {
  kind: 'merge'
  /** the branch passed to Git as part of the merge operation */
  branch: string
}

/** A custom shape of data for actions to provide to help with error handling */
type IErrorContext = MergeErrorContext

export interface IErrorMetadata {
  /** The first argument passed to `git` which triggered this error */
  readonly command?: string

  /** Was the action which caused this error part of a background task? */
  readonly backgroundTask?: boolean

  /** The repository from which this error originated. */
  readonly repository?: Repository | CloningRepository

  /** The action to retry if applicable. */
  readonly retryAction?: RetryAction

  /** The tip of the repository at the time of the action */
  readonly tip?: Tip

  /** Additional context that specific actions can provide fields for */
  readonly context?: IErrorContext
}

/** An error which contains additional metadata. */
export class ErrorWithMetadata extends Error {
  /** The error's metadata. */
  public readonly metadata: IErrorMetadata

  /** The underlying error to which the metadata is being attached. */
  public readonly underlyingError: Error

  public constructor(error: Error, metadata: IErrorMetadata) {
    super(error.message)

    this.name = error.name
    this.stack = error.stack
    this.underlyingError = error
    this.metadata = metadata
  }
}
