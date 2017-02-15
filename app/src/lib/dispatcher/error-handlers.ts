import { IAppState } from '../app-state'
import { Dispatcher } from './index'

/** Handle errors by presenting them. */
export function defaultErrorHandler(error: Error, appState: IAppState, dispatcher: Dispatcher): Promise<Error | null> {
  dispatcher.presentError(error)

  return Promise.resolve(null)
}
