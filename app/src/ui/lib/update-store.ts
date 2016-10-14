// import { remote } from 'electron'

// Given that `autoUpdater` is entirely async anyways, I *think* it's safe to
// use with `remote`.
// const autoUpdater = remote.autoUpdater

import { Emitter, Disposable } from 'event-kit'

// import { getVersion } from './app-proxy'

/** The states the auto updater can be in. */
export enum UpdateState {
  /** The auto updater is checking for updates. */
  CheckingForUpdates,

  /** An update is available and will begin downloading. */
  UpdateAvailable,

  /** No update is available. */
  UpdateNotAvailable,

  /** An update has been downloaded and is ready to be installed. */
  UpdateReady,
}

// const UpdatesURLBase = 'https://central.github.com/api/deployments/desktop/desktop/latest'

/** A store which contains the current state of the auto updater. */
class UpdateStore {
  private emitter = new Emitter()
  private _state = UpdateState.UpdateNotAvailable

  public constructor() {
    // autoUpdater.on('error', this.onAutoUpdaterError)
    // autoUpdater.on('checking-for-update', this.onCheckingForUpdate)
    // autoUpdater.on('update-available', this.onUpdateAvailable)
    // autoUpdater.on('update-not-available', this.onUpdateNotAvailable)
    // autoUpdater.on('update-downloaded', this.onUpdateDownloaded)
    //
    // window.addEventListener('beforeunload', () => {
    //   autoUpdater.removeListener('error', this.onAutoUpdaterError)
    //   autoUpdater.removeListener('checking-for-update', this.onCheckingForUpdate)
    //   autoUpdater.removeListener('update-available', this.onUpdateAvailable)
    //   autoUpdater.removeListener('update-not-available', this.onUpdateNotAvailable)
    //   autoUpdater.removeListener('update-downloaded', this.onUpdateDownloaded)
    // })
  }

  // private onAutoUpdaterError = (error: Error) => {
  //   this.emitError(error)
  // }
  //
  // private onCheckingForUpdate = () => {
  //   this._state = UpdateState.CheckingForUpdates
  //   this.emitDidChange()
  // }
  //
  // private onUpdateAvailable = () => {
  //   this._state = UpdateState.UpdateAvailable
  //   this.emitDidChange()
  // }
  //
  // private onUpdateNotAvailable = () => {
  //   this._state = UpdateState.UpdateNotAvailable
  //   this.emitDidChange()
  // }
  //
  // private onUpdateDownloaded = () => {
  //   this._state = UpdateState.UpdateReady
  //   this.emitDidChange()
  // }

  /** Register a function to call when the auto updater state changes. */
  public onDidChange(fn: (state: UpdateState) => void): Disposable {
    return this.emitter.on('did-change', fn)
  }

  // private emitDidChange() {
    // this.emitter.emit('did-change', this._state)
  // }

  /** Register a function to call when the auto updater encounters an error. */
  public onError(fn: (error: Error) => void): Disposable {
    return this.emitter.on('error', fn)
  }

  private emitError(error: Error) {
    this.emitter.emit('error', error)
  }

  /** The current auto updater state. */
  public get state(): UpdateState {
    return this._state
  }

  // private getFeedURL(username: string): string {
    // return `${UpdatesURLBase}?version=1&username=${username}`
  // }

  /** Check for updates using the given username. */
  public checkForUpdates(username: string) {
    try {
      // autoUpdater.setFeedURL(this.getFeedURL(username))
      // autoUpdater.checkForUpdates()
    } catch (e) {
      this.emitError(e)
    }
  }

  /** Quit and install the update. */
  public quitAndInstallUpdate() {
    // autoUpdater.quitAndInstall()
  }
}

/** The store which contains the current state of the auto updater. */
export const updateStore = new UpdateStore()
