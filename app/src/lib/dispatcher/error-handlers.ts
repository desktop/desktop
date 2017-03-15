import { Dispatcher, AppStore, ErrorHandler } from './index'
import { SelectionType } from '../app-state'
import { GitError } from '../git/core'
import { GitError as GitErrorType, RepositoryDoesNotExistErrorCode } from 'git-kitchen-sink'

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
