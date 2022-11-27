import { shell } from '../../lib/app-shell'
import { Dispatcher } from '../dispatcher'

export async function openFile(
  fullPath: string | string[],
  dispatcher: Dispatcher
): Promise<void> {
  let result
  if (typeof fullPath === 'string') {
    result = await shell.openExternal(`file://${fullPath}`)
  } else {
    for (const path of fullPath) {
      result = await shell.openExternal(`file://${path}`)
    }
  }

  if (!result) {
    const error = {
      name: 'no-external-program',
      message: `Unable to open file ${fullPath} in an external program. Please check you have a program associated with this file extension`,
    }
    await dispatcher.postError(error)
  }
}
