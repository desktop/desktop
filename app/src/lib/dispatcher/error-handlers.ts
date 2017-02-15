import { IAppError, IAppState } from '../app-state'
import { Dispatcher } from './index'

/** Handle errors by presenting them. */
export function defaultErrorHandler(error: IAppError, appState: IAppState, dispatcher: Dispatcher): Promise<IAppError | null> {
  dispatcher.presentError(error)

  return Promise.resolve(null)
}
