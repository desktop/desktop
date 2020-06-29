import { app, dialog } from 'electron'
import { setCrashMenu } from './menu'
import { formatError } from '../lib/logging/format-error'
import { CrashWindow } from './crash-window'

let hasReportedUncaughtException = false

/** Show the uncaught exception UI. */
export function showUncaughtException(isLaunchError: boolean, error: Error) {
  log.error(formatError(error))

  if (hasReportedUncaughtException) {
    return
  }

  hasReportedUncaughtException = true

  setCrashMenu()

  const crashWindow = new CrashWindow(
    isLaunchError ? 'launch' : 'generic',
    error
  )

  crashWindow.onDidLoad(() => {
    crashWindow.show()
  })

  crashWindow.onFailedToLoad(async () => {
    await dialog.showMessageBox({
      type: 'error',
      title: __DARWIN__ ? `Unrecoverable Error` : 'Unrecoverable error',
      message:
        `GitHub Desktop has encountered an unrecoverable error and will need to restart.\n\n` +
        `This has been reported to the team, but if you encounter this repeatedly please report ` +
        `this issue to the GitHub Desktop issue tracker.\n\n${
          error.stack || error.message
        }`,
    })

    if (!__DEV__) {
      app.relaunch()
    }
    app.quit()
  })

  crashWindow.onClose(() => {
    if (!__DEV__) {
      app.relaunch()
    }
    app.quit()
  })

  crashWindow.load()
}
