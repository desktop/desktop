import { Repository } from '../models/repository'
import { CloningRepository } from '../models/cloning-repository'
import { RetryAction, RetryActionType } from '../models/retry-actions'
import { GitErrorContext } from './git-error-context'
import { Branch } from '../models/branch'

export interface IErrorMetadata {
  /** Was the action which caused this error part of a background task? */
  readonly backgroundTask?: boolean

  /** The repository from which this error originated. */
  readonly repository?: Repository | CloningRepository

  /** The action to retry if applicable. */
  readonly retryAction?: RetryAction

  /** Additional context that specific actions can provide fields for */
  readonly gitContext?: GitErrorContext
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

export class CheckoutError extends ErrorWithMetadata {
  public constructor(
    underlyingError: Error,
    repository: Repository,
    branch: Branch
  ) {
    super(underlyingError, {
      gitContext: { kind: 'checkout', branchToCheckout: branch },
      repository,
      retryAction: {
        type: RetryActionType.Checkout,
        branch,
        repository,
      },
    })
  }
}
