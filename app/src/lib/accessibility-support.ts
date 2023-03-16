import { app } from 'electron'
import * as ipcWebContents from '../main-process/ipc-webcontents'

/**
 * Registers event handlers for all window state transition events and
 * forwards those to the renderer process for a given window.
 */
export function registerAccessibilitySupportEvents(
  window: Electron.BrowserWindow
) {
  app.on(
    'accessibility-support-changed',
    (event, accessibilitySupportEnabled) => {
      ipcWebContents.send(
        window.webContents,
        'accessibility-support-changed',
        accessibilitySupportEnabled
      )
    }
  )
}
