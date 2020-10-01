import { remote } from 'electron'

// Given that `autoUpdater` is entirely async anyways, I *think* it's safe to
// use with `remote`.
const autoUpdater = remote.autoUpdater
const lastSuccessfulCheckKey = 'last-successful-update-check'

import { Emitter, Disposable } from 'event-kit'

import { sendWillQuitSync } from '../main-process-proxy'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { parseError } from '../../lib/squirrel-error-parser'

import { ReleaseSummary } from '../../models/release-notes'
import { generateReleaseSummary } from '../../lib/release-notes'
import { setNumber, getNumber } from '../../lib/local-storage'

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
  newRelease: ReleaseSummary | null
}

/** A store which contains the current state of the auto updater. */
class UpdateStore {
  private emitter = new Emitter()
  private status = UpdateStatus.UpdateNotAvailable
  private lastSuccessfulCheck: Date | null = null
  private newRelease: ReleaseSummary | null = null

  /** Is the most recent update check user initiated? */
  private userInitiatedUpdate = true

  public constructor() {
    const lastSuccessfulCheckTime = getNumber(lastSuccessfulCheckKey, 0)

    if (lastSuccessfulCheckTime > 0) {
      this.lastSuccessfulCheck = new Date(lastSuccessfulCheckTime)
    }

    autoUpdater.on('error', this.onAutoUpdaterError)
    autoUpdater.on('checking-for-update', this.onCheckingForUpdate)
    autoUpdater.on('update-available', this.onUpdateAvailable)
    autoUpdater.on('update-not-available', this.onUpdateNotAvailable)
    autoUpdater.on('update-downloaded', this.onUpdateDownloaded)

    window.addEventListener('beforeunload', () => {
      autoUpdater.removeListener('error', this.onAutoUpdaterError)
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

  private touchLastChecked() {
    const now = new Date()
    this.lastSuccessfulCheck = now
    setNumber(lastSuccessfulCheckKey, now.getTime())
  }

  private onAutoUpdaterError = (error: Error) => {
    this.status = UpdateStatus.UpdateNotAvailable

    if (__WIN32__) {
      const parsedError = parseError(error)
      this.emitError(parsedError || error)
    } else {
      this.emitError(error)
    }
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

  private onUpdateDownloaded = async () => {
    this.newRelease = await generateReleaseSummary()

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
      newRelease: this.newRelease,
    }
  }

  /**
   * Check for updates.
   *
   * @param inBackground - Are we checking for updates in the background, or was
   *                       this check user-initiated?
   */
  public checkForUpdates(inBackground: boolean) {
    // An update has been downloaded and the app is waiting to be restarted.
    // Checking for updates again may result in the running app being nuked
    // when it finds a subsequent update.
    if (__WIN32__ && this.status === UpdateStatus.UpdateReady) {
      return
    }

    this.userInitiatedUpdate = !inBackground

    try {
      autoUpdater.setFeedURL({ url: __UPDATES_URL__ })
      autoUpdater.checkForUpdates()
    } catch (e) {
      this.emitError(e)
    }
  }

  /** Quit and install the update. */
  public quitAndInstallUpdate() {
    // This is synchronous so that we can ensure the app will let itself be quit
    // before we call the function to quit.
    // eslint-disable-next-line no-sync
    sendWillQuitSync()
    autoUpdater.quitAndInstall()
  }
}

/** The store which contains the current state of the auto updater. */
export const updateStore = new UpdateStore()
