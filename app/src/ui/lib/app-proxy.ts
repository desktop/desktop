import { remote } from 'electron'

let app: Electron.App | null = null
let version: string | null = null
let name: string | null = null
let path: string | null = null

function getApp(): Electron.App {
  if (!app) {
    app = remote.app
  }

  return app
}

/**
 * Get the version of the app.
 *
 * This is preferrable to using `remote` directly because we cache the result.
 */
export function getVersion(): string {
  if (!version) {
    version = getApp().getVersion()
  }

  return version
}

/**
 * Get the name of the app.
 *
 * This is preferrable to using `remote` directly because we cache the result.
 */
export function getName(): string {
  if (!name) {
    name = getApp().getName()
  }

  return name
}

/**
 * Get the name of the app.
 *
 * This is preferrable to using `remote` directly because we cache the result.
 */
export function getAppPath(): string {
  if (!path) {
    path = getApp().getAppPath()
  }

  return path
}
