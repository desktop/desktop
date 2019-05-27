import { ipcRenderer } from 'electron'
import { OpenDialogPreferences } from '../../models/electron'

/**
 * IPC-based wrapper for Electron's showOpenDialog, which ensures this follows
 * the recommended patterns for showing the underlying dialog
 */
export function showOpenDialog(preferences: Array<OpenDialogPreferences>) {
  return new Promise<ReadonlyArray<string> | undefined>((resolve, reject) => {
    ipcRenderer.once(
      'show-open-dialog-result',
      (
        event: Electron.IpcMessageEvent,
        { directories }: { directories: string[] | undefined }
      ) => {
        resolve(directories)
      }
    )

    ipcRenderer.send('show-open-dialog', { preferences })
  })
}
