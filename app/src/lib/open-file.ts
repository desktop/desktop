import { shell } from 'electron'
import { Dispatcher } from './dispatcher/dispatcher'

export function openFile(fullPath: string, dispatcher: Dispatcher) {
  const result = shell.openExternal(`file://${fullPath}`)

  if (!result) {
    const error = {
      name: 'no-external-program',
      message: `Unable to open file ${fullPath} in an external program. Please check you have a program associated with this file extension`,
    }
    dispatcher.postError(error)
  }
}
