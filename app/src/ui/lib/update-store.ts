import { remote, ipcRenderer } from 'electron'

// Given that `autoUpdater` is entirely async anyways, I *think* it's safe to
// use with `remote`.
const autoUpdater = remote.autoUpdater
const lastSuccessfulCheckKey = 'last-successful-update-check'

import { Emitter, Disposable } from 'event-kit'

import { getVersion } from './app-proxy'
import { sendWillQuitSync } from '../main-process-proxy'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'

/** The states the auto updater can be in. */
export enum UpdateStatus {
  /** The auto updater is checking for updates. */
  CheckingForUpdates,

  /** An update is available and will begin downloading. */
  UpdateAvailable,

  /** No update is available. */
  UpdateNotAvailable,

  /** An update has been downloaded and is ready to be installed. */
  UpdateReady,
}

export interface IUpdateState {
  status: UpdateStatus
  lastSuccessfulCheck: Date | null
}

const UpdatesURLBase =
  'https://central.github.com/api/deployments/desktop/desktop/latest'

/** A store which contains the current state of the auto updater. */
class UpdateStore {
  private emitter = new Emitter()
  private status = UpdateStatus.UpdateNotAvailable
  private lastSuccessfulCheck: Date | null = null

  /** Is the most recent update check user initiated? */
  private userInitiatedUpdate = true

  public constructor() {
    const lastSuccessfulCheckValue = localStorage.getItem(
      lastSuccessfulCheckKey
    )

    if (lastSuccessfulCheckValue) {
      const lastSuccessfulCheckTime = parseInt(lastSuccessfulCheckValue, 10)

      if (!isNaN(lastSuccessfulCheckTime)) {
        this.lastSuccessfulCheck = new Date(lastSuccessfulCheckTime)
      }
    }

    // We're using our own error event instead of `autoUpdater`s so that we can
    // properly serialize the `Error` object for transport over IPC. See
    // https://github.com/desktop/desktop/issues/1266.
    ipcRenderer.on(
      'auto-updater-error',
      (event: Electron.IpcMessageEvent, error: Error) => {
        this.onAutoUpdaterError(error)
      }
    )

    autoUpdater.on('checking-for-update', this.onCheckingForUpdate)
    autoUpdater.on('update-available', this.onUpdateAvailable)
    autoUpdater.on('update-not-available', this.onUpdateNotAvailable)
    autoUpdater.on('update-downloaded', this.onUpdateDownloaded)

    // This seems to prevent tests from cleanly exiting on Appveyor (see
    // https://ci.appveyor.com/project/github-windows/desktop/build/1466). So
    // let's just avoid it.
    if (!process.env.TEST_ENV) {
      window.addEventListener('beforeunload', () => {
        autoUpdater.removeListener(
          'checking-for-update',
          this.onCheckingForUpdate
        )
        autoUpdater.removeListener('update-available', this.onUpdateAvailable)
        autoUpdater.removeListener(
          'update-not-available',
          this.onUpdateNotAvailable
        )
        autoUpdater.removeListener('update-downloaded', this.onUpdateDownloaded)
      })
    }
  }

  private touchLastChecked() {
    const now = new Date()
    const persistedValue = now.getTime().toString()

    this.lastSuccessfulCheck = now
    localStorage.setItem(lastSuccessfulCheckKey, persistedValue)
  }

  private onAutoUpdaterError = (error: Error) => {
    // If we get an error during any stage of the update process we'll
    this.status = UpdateStatus.UpdateNotAvailable
    this.emitError(error)
  }

  private onCheckingForUpdate = () => {
    this.status = UpdateStatus.CheckingForUpdates
    this.emitDidChange()
  }

  private onUpdateAvailable = () => {
    this.touchLastChecked()
    this.status = UpdateStatus.UpdateAvailable
    this.emitDidChange()
  }

  private onUpdateNotAvailable = () => {
    this.touchLastChecked()
    this.status = UpdateStatus.UpdateNotAvailable
    this.emitDidChange()
  }

  private onUpdateDownloaded = () => {
    this.status = UpdateStatus.UpdateReady
    this.emitDidChange()
  }

  /** Register a function to call when the auto updater state changes. */
  public onDidChange(fn: (state: IUpdateState) => void): Disposable {
    return this.emitter.on('did-change', fn)
  }

  private emitDidChange() {
    this.emitter.emit('did-change', this.state)
  }

  /** Register a function to call when the auto updater encounters an error. */
  public onError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('error', fn)
  }

  private emitError(error: Error) {
    const updatedError = new ErrorWithMetadata(error, {
      backgroundTask: !this.userInitiatedUpdate,
    })
    this.emitter.emit('error', updatedError)
  }

  /** The current auto updater state. */
  public get state(): IUpdateState {
    return {
      status: this.status,
      lastSuccessfulCheck: this.lastSuccessfulCheck,
    }
  }

  private getFeedURL(username: string): string {
    return `${UpdatesURLBase}?version=${getVersion()}&username=${username}`
  }

  /**
   * Check for updates using the given username.
   *
   * @param username     - The username used to check for updates.
   * @param inBackground - Are we checking for updates in the background, or was
   *                       this check user-initiated?
   */
  public checkForUpdates(username: string, inBackground: boolean) {
    this.userInitiatedUpdate = !inBackground

    try {
      autoUpdater.setFeedURL(this.getFeedURL(username))
      autoUpdater.checkForUpdates()
    } catch (e) {
      this.emitError(e)
    }
  }

  /** Quit and install the update. */
  public quitAndInstallUpdate() {
    // This is synchronous so that we can ensure the app will let itself be quit
    // before we call the function to quit.
    // tslint:disable-next-line:no-sync-functions
    sendWillQuitSync()
    autoUpdater.quitAndInstall()
  }
}

/** The store which contains the current state of the auto updater. */
export const updateStore = new UpdateStore()
