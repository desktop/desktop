import { Dispatcher, AppStore, ErrorHandler } from './index'
import { SelectionType } from '../app-state'
import { GitError } from '../git/core'
import { GitError as GitErrorType, RepositoryDoesNotExistErrorCode } from 'dugite'
import { ErrorWithMetadata } from '../error-with-metadata'

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

/** Handle errors by presenting them. */
export async function defaultErrorHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
  await dispatcher.presentError(error)

  return null
}

/** Create a new missing repository error handler with the given AppStore. */
export function createMissingRepositoryHandler(appStore: AppStore): ErrorHandler {
  return async (error: Error, dispatcher: Dispatcher) => {
    const appState = appStore.getState()
    const selectedState = appState.selectedState
    if (!selectedState) {
      return error
    }

    if (selectedState.type !== SelectionType.MissingRepository && selectedState.type !== SelectionType.Repository) {
      return error
    }

    const repository = selectedState.repository
    if (repository.missing) {
      return null
    }

    const errorWithCode = asErrorWithCode(error)

    const missing =
      error instanceof GitError && error.result.gitError === GitErrorType.NotAGitRepository ||
      (errorWithCode && errorWithCode.code === RepositoryDoesNotExistErrorCode)

    if (missing) {
      await dispatcher.updateRepositoryMissing(selectedState.repository, true)
      return null
    }

    return error
  }
}

/** Trap and handle uncaught errors to ensure the app exits cleanly */
export async function unhandledExceptionHandler(error: Error, dispatcher: Dispatcher) {
  const e = asErrorWithMetadata(error)
  if (!e) {
    return error
  }

  const metadata = e.metadata
  if (metadata.uncaught) {
    await dispatcher.presentError(error)
    return null
  }

  return error
}

/** Handle errors that happen as a result of a background task. */
export async function backgroundTaskHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
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
