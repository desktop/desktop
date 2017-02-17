import { Dispatcher } from './index'
import { GitError } from '../git/core'
import { GitError as GitErrorType } from 'git-kitchen-sink'
import { PopupType  as popupType } from '../app-state'

/** Handle errors by presenting them. */
export async function defaultErrorHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
  await dispatcher.presentError(error)

  return null
}

//** Handle errors by giving user actions to complete. */
export async function performActionErrorHandler(error: Error, dispatcher: Dispatcher): Promise<Error | null> {
  if (error instanceof GitError) {
    switch (error.result.gitError)  {
      case GitErrorType.HTTPSAuthenticationFailed: {
        await dispatcher.showPopup({ type: popupType.Signin })
        break
      }
    }
  }

  return null
}
