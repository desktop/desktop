import * as remote from '@electron/remote'

let app: Electron.App | null = null
let path: string | null = null
let userDataPath: string | null = null
let documentsPath: string | null = null

function getApp(): Electron.App {
  if (!app) {
    app = remote.app
  }

  return app
}

/**
 * Get the version of the app.
 *
 * This is preferable to using `remote` directly because we cache the result.
 */
export function getVersion(): string {
  return __APP_VERSION__
}

/**
 * Get the name of the app.
 */
export function getName(): string {
  return __APP_NAME__
}

/**
 * Get the path to the application.
 *
 * This is preferable to using `remote` directly because we cache the result.
 */
export function getAppPath(): string {
  if (!path) {
    path = getApp().getAppPath()
  }

  return path
}

/**
 * Get the path to the user's data.
 *
 * This is preferable to using `remote` directly because we cache the result.
 */
export function getUserDataPath(): string {
  if (!userDataPath) {
    userDataPath = getApp().getPath('userData')
  }

  return userDataPath
}

/**
 * Get the path to the user's documents path.
 *
 * This is preferable to using `remote` directly because we cache the result.
 */
export function getDocumentsPath(): string {
  if (!documentsPath) {
    const app = getApp()
    try {
      documentsPath = app.getPath('documents')
    } catch (ex) {
      // a user profile may not have the Documents folder defined on Windows
      documentsPath = app.getPath('home')
    }
  }

  return documentsPath
}
