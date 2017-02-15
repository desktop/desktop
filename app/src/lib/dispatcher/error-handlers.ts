import { IAppState } from '../app-state'
import { Dispatcher } from './index'

/** Handle errors by presenting them. */
export async function defaultErrorHandler(error: Error, appState: IAppState, dispatcher: Dispatcher): Promise<Error | null> {
  await dispatcher.presentError(error)

  return null
}
