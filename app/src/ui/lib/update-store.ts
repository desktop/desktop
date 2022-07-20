const lastSuccessfulCheckKey = 'last-successful-update-check'

import { Emitter, Disposable } from 'event-kit'

import {
  checkForUpdates,
  isRunningUnderARM64Translation,
  onAutoUpdaterCheckingForUpdate,
  onAutoUpdaterError,
  onAutoUpdaterUpdateAvailable,
  onAutoUpdaterUpdateDownloaded,
  onAutoUpdaterUpdateNotAvailable,
  quitAndInstallUpdate,
  sendWillQuitSync,
} from '../main-process-proxy'
import { ErrorWithMetadata } from '../../lib/error-with-metadata'
import { parseError } from '../../lib/squirrel-error-parser'

import { ReleaseSummary } from '../../models/release-notes'
import { generateReleaseSummary } from '../../lib/release-notes'
import { setNumber, getNumber } from '../../lib/local-storage'
import {
  enableImmediateUpdateFromEmulatedX64ToARM64,
  enableUpdateFromEmulatedX64ToARM64,
} from '../../lib/feature-flag'
import { offsetFromNow } from '../../lib/offset-from'
import { gte, SemVer } from 'semver'
import { getRendererGUID } from '../../lib/get-renderer-guid'
import { getVersion } from './app-proxy'

/** The last version a showcase was seen. */
export const lastShowCaseVersionSeen = 'version-of-last-showcase'

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

  /** We have not checked for an update yet. */
  UpdateNotChecked,
}

export interface IUpdateState {
  status: UpdateStatus
  lastSuccessfulCheck: Date | null
  isX64ToARM64ImmediateAutoUpdate: boolean
  newReleases: ReadonlyArray<ReleaseSummary> | null
}

/** A store which contains the current state of the auto updater. */
class UpdateStore {
  private emitter = new Emitter()
  private status = UpdateStatus.UpdateNotChecked
  private lastSuccessfulCheck: Date | null = null
  private newReleases: ReadonlyArray<ReleaseSummary> | null = null
  private isX64ToARM64ImmediateAutoUpdate: boolean = false

  /** Is the most recent update check user initiated? */
  private userInitiatedUpdate = true

  public constructor() {
    const lastSuccessfulCheckTime = getNumber(lastSuccessfulCheckKey, 0)

    if (lastSuccessfulCheckTime > 0) {
      this.lastSuccessfulCheck = new Date(lastSuccessfulCheckTime)
    }

    onAutoUpdaterError(this.onAutoUpdaterError)
    onAutoUpdaterCheckingForUpdate(this.onCheckingForUpdate)
    onAutoUpdaterUpdateAvailable(this.onUpdateAvailable)
    onAutoUpdaterUpdateNotAvailable(this.onUpdateNotAvailable)
    onAutoUpdaterUpdateDownloaded(this.onUpdateDownloaded)
  }

  private touchLastChecked() {
    const now = new Date()
    this.lastSuccessfulCheck = now
    setNumber(lastSuccessfulCheckKey, now.getTime())
  }

  private onAutoUpdaterError = (e: Electron.IpcRendererEvent, error: Error) => {
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

  private onUpdateNotAvailable = async () => {
    // This is so we can check for pretext changelog for showcasing a recent update
    this.newReleases = await generateReleaseSummary()
    this.touchLastChecked()
    this.status = UpdateStatus.UpdateNotAvailable
    this.emitDidChange()
  }

  private onUpdateDownloaded = async () => {
    this.newReleases = await generateReleaseSummary()
    // We know it's an "immediate" auto-update from x64 to arm64 if the app is
    // running on arm64 under x64 emulation and there is only one new release
    // and it's the same version we have right now (which means we spoofed
    // Central with an old version of the app).
    this.isX64ToARM64ImmediateAutoUpdate =
      enableImmediateUpdateFromEmulatedX64ToARM64() &&
      this.newReleases !== null &&
      this.newReleases.length === 1 &&
      this.newReleases[0].latestVersion === getVersion() &&
      (await isRunningUnderARM64Translation())
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
      newReleases: this.newReleases,
      isX64ToARM64ImmediateAutoUpdate: this.isX64ToARM64ImmediateAutoUpdate,
    }
  }

  /**
   * Check for updates.
   *
   * @param inBackground - Are we checking for updates in the background, or was
   *                       this check user-initiated?
   */
  public async checkForUpdates(inBackground: boolean) {
    // An update has been downloaded and the app is waiting to be restarted.
    // Checking for updates again may result in the running app being nuked
    // when it finds a subsequent update.
    if (__WIN32__ && this.status === UpdateStatus.UpdateReady) {
      return
    }

    const updatesUrl = await this.getUpdatesUrl()

    if (updatesUrl === null) {
      return
    }

    this.userInitiatedUpdate = !inBackground

    const error = await checkForUpdates(updatesUrl)

    if (error !== undefined) {
      this.emitError(error)
    }
  }

  private async getUpdatesUrl() {
    let url = null

    try {
      url = new URL(__UPDATES_URL__)
    } catch (e) {
      log.error('Error parsing updates url', e)
      return __UPDATES_URL__
    }

    // Send the GUID to the update server for staggered release support
    url.searchParams.set('guid', await getRendererGUID())

    // If the app is running under arm64 to x64 translation, we need to tweak the
    // update URL here to point at the arm64 binary.
    if (
      enableUpdateFromEmulatedX64ToARM64() &&
      (await isRunningUnderARM64Translation()) === true
    ) {
      url.pathname = url.pathname.replace(
        /\/desktop\/desktop\/(x64\/)?latest/,
        '/desktop/desktop/arm64/latest'
      )

      // If we want the app to force an auto-update from x64 to arm64 right
      // after being installed, we need to spoof a really old version to trick
      // both Central and Squirrel into thinking we need the update.
      if (enableImmediateUpdateFromEmulatedX64ToARM64()) {
        url.searchParams.set('version', '0.0.64')
      }
    }

    return url.toString()
  }

  /** Quit and install the update. */
  public quitAndInstallUpdate() {
    // This is synchronous so that we can ensure the app will let itself be quit
    // before we call the function to quit.
    // eslint-disable-next-line no-sync
    sendWillQuitSync()
    quitAndInstallUpdate()
  }

  /**
   * Method to determine if we should show an update showcase call to action.
   *
   * @returns true if there is a pretext on the latest releases and that release
   * was published in the last 15 days.
   */
  public async isUpdateShowcase() {
    if (
      (__RELEASE_CHANNEL__ === 'development' ||
        __RELEASE_CHANNEL__ === 'test') &&
      this.newReleases === null &&
      this.status === UpdateStatus.UpdateNotChecked
    ) {
      // On prod or with test manual check for updates, we are doing this during
      // the automatic check for updates
      this.newReleases = await generateReleaseSummary()
    }

    if (this.newReleases === null) {
      return false
    }

    const lastShowCaseVersion = localStorage.getItem(lastShowCaseVersionSeen)
    if (lastShowCaseVersion !== null) {
      const lastShowCaseSemVersion = new SemVer(lastShowCaseVersion)
      const latestRelease = new SemVer(this.newReleases[0].latestVersion)
      if (gte(lastShowCaseSemVersion, latestRelease)) {
        return false
      }
    }

    return this.newReleases
      .filter(
        r => new Date(r.datePublished).getTime() > offsetFromNow(-15, 'days')
      )
      .some(r => r.pretext.length > 0)
  }
}

/** The store which contains the current state of the auto updater. */
export const updateStore = new UpdateStore()
