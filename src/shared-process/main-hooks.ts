import {ipcMain} from 'electron'
import SharedProcess from './shared-process'
import {Message} from './message-types'

export default function setupSharedProcessHooks(sharedProcess: SharedProcess) {
  // This message comes from a renderer to the main process, which then sends it
  // to the shared process.
  ipcMain.on('shared/request', (event, args) => {
    const message: Message = args[0]
    sharedProcess.send(message)
  })
}
