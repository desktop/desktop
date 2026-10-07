import { Repository } from '../models/repository'
import { CloningRepository } from '../models/cloning-repository'
import { RetryAction, RetryActionType } from '../models/retry-actions'
import { GitErrorContext } from './git-error-context'
import { Branch } from '../models/branch'
import { WorkingDirectoryFileChange } from '../models/status'

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

/** Preserve nested transport, domain, aggregate, and cleanup failures without losing their identity. */
export function getErrorCauses(error: unknown): ReadonlyArray<unknown> {
  const causes: unknown[] = []
  const visit = (value: unknown) => {
    if (causes.includes(value)) {
      return
    }
    causes.push(value)
    if (value instanceof ErrorWithMetadata) {
      visit(value.underlyingError)
    }
    if (value instanceof Error && value.cause !== undefined) {
      visit(value.cause)
    }
    if (value instanceof AggregateError) {
      value.errors.forEach(visit)
    }
  }
  visit(error)
  return causes
}

/**
 * An error thrown when a failure occurs while checking out a branch.
 * Technically just a convience class on top of ErrorWithMetadata
 */
export class CheckoutError extends ErrorWithMetadata {
  public constructor(error: Error, repository: Repository, branch: Branch) {
    super(error, {
      gitContext: { kind: 'checkout', branchToCheckout: branch },
      retryAction: { type: RetryActionType.Checkout, branch, repository },
      repository,
    })
  }
}

/**
 * An error thrown when a failure occurs while discarding changes to trash.
 * Technically just a convenience class on top of ErrorWithMetadata
 */
export class DiscardChangesError extends ErrorWithMetadata {
  public constructor(
    error: Error,
    repository: Repository,
    files: ReadonlyArray<WorkingDirectoryFileChange>
  ) {
    super(error, {
      retryAction: { type: RetryActionType.DiscardChanges, files, repository },
    })
  }
}

export class CreateRepositoryError extends ErrorWithMetadata {
  public constructor(error: Error) {
    super(error, {
      gitContext: { kind: 'create-repository' },
    })
  }
}
