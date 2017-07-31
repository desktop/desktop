import { Dispatcher } from './index'
import { GitError } from '../git/core'
import {
  GitError as DugiteError,
  RepositoryDoesNotExistErrorCode,
} from 'dugite'
import { ErrorWithMetadata } from '../error-with-metadata'
import { AuthenticationErrors } from '../git/authentication'
import { Repository } from '../../models/repository'

/** An error which also has a code property. */
interface IErrorWithCode extends Error {
  readonly code: string
}

/**
 * Cast the error to an error containing a code if it has a code. Otherwise
 * return null.
 */
function asErrorWithCode(error: Error): IErrorWithCode | null {
  const e = error as any
  if (e.code) {
    return e
  } else {
    return null
  }
}

/**
 * Cast the error to an error with metadata if possible. Otherwise return null.
 */
function asErrorWithMetadata(error: Error): ErrorWithMetadata | null {
  if (error instanceof ErrorWithMetadata) {
    return error
  } else {
    return null
  }
}

/** Cast the error to a `GitError` if possible. Otherwise return null. */
function asGitError(error: Error): GitError | null {
  if (error instanceof GitError) {
    return error
  } else {
    return null
  }
}

/** Handle errors by presenting them. */
export async function defaultErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error) || error
  await dispatcher.presentError(e)

  return null
}

/** Handler for when a repository disappears 😱. */
export async function missingRepositoryHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const repository = e.metadata.repository
  if (!repository || !(repository instanceof Repository)) {
    return error
  }

  if (repository.missing) {
    return null
  }

  const errorWithCode = asErrorWithCode(e.underlyingError)
  const gitError = asGitError(e.underlyingError)
  const missing =
    (gitError && gitError.result.gitError === DugiteError.NotAGitRepository) ||
    (errorWithCode && errorWithCode.code === RepositoryDoesNotExistErrorCode)

  if (missing) {
    await dispatcher.updateRepositoryMissing(repository, true)
    return null
  }

  return error
}

/** Handle errors that happen as a result of a background task. */
export async function backgroundTaskHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const metadata = e.metadata
  // Ignore errors from background tasks. We might want more nuance here in the
  // future, but this'll do for now.
  if (metadata.backgroundTask) {
    return null
  } else {
    return error
  }
}

/** Handle git authentication errors in a manner that seems Right And Good. */
export async function gitAuthenticationErrorHandler(
  error: Error,
  dispatcher: Dispatcher
): Promise<Error | null> {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const gitError = asGitError(e.underlyingError)
  if (!gitError) {
    return error
  }

  const dugiteError = gitError.result.gitError
  if (!dugiteError) {
    return error
  }

  if (!AuthenticationErrors.has(dugiteError)) {
    return error
  }

  const repository = e.metadata.repository
  if (!repository) {
    return error
  }

  // If it's a GitHub repository then it's not some generic git server
  // authentication problem, but more likely a legit permission problem. So let
  // the error continue to bubble up.
  if (repository instanceof Repository && repository.gitHubRepository) {
    return error
  }

  const retry = e.metadata.retryAction
  if (!retry) {
    log.error(`No retry action provided for a git authentication error.`, e)
    return error
  }

  await dispatcher.promptForGenericGitAuthentication(repository, retry)

  return null
}
