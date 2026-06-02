import {
  Menu,
  app,
  dialog,
  BrowserWindow,
  autoUpdater,
  nativeTheme,
  // eslint-disable-next-line no-restricted-imports
  ipcMain as electronIpcMain,
} from 'electron'
import { IpcMainEvent } from 'electron/main'
import { shell } from '../lib/app-shell'
import { Emitter, Disposable } from 'event-kit'
import { encodePathAsUrl } from '../lib/path'
import {
  getWindowState,
  registerWindowStateChangedEvents,
} from '../lib/window-state'
import { MenuEvent } from './menu'
import { URLActionType } from '../lib/parse-app-url'
import { ILaunchStats } from '../lib/stats'
import { menuFromElectronMenu } from '../models/app-menu'
import { now } from './now'
import * as path from 'path'
import windowStateKeeper from 'electron-window-state'
import * as ipcWebContents from './ipc-webcontents'
import { installNotificationCallback } from './notifications'
import { addTrustedIPCSender } from './trusted-ipc-sender'
import { getUpdaterGUID } from '../lib/get-updater-guid'
import { CLIAction } from '../lib/cli-action'

export class AppWindow {
  private window: Electron.BrowserWindow
  private emitter = new Emitter()
  private readonly cleanupTasks = new Array<() => void>()

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null
  private isDownloadingUpdate: boolean = false
  public repositoryPath: string | null = null

  private minWidth = 960
  private minHeight = 660

  // See https://github.com/desktop/desktop/pull/11162
  private shouldMaximizeOnShow = false
  private quitting = false
  private quittingEvenIfUpdating = false

  public constructor() {
    const savedWindowState = windowStateKeeper({
      defaultWidth: this.minWidth,
      defaultHeight: this.minHeight,
      maximize: false,
    })

    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      x: savedWindowState.x,
      y: savedWindowState.y,
      width: savedWindowState.width,
      height: savedWindowState.height,
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      show: false,
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff',
      webPreferences: {
        // Disable auxclick event
        // See https://developers.google.com/web/updates/2016/10/auxclick
        disableBlinkFeatures: 'Auxclick',
        nodeIntegration: true,
        spellcheck: true,
        contextIsolation: false,
      },
      acceptFirstMouse: true,
    }

    if (__DARWIN__) {
      windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
      windowOptions.frame = false
    } else if (__LINUX__) {
      windowOptions.icon = path.join(__dirname, 'static', 'icon-logo.png')
    }

    this.window = new BrowserWindow(windowOptions)
    addTrustedIPCSender(this.window.webContents)

    this.addCleanupTask(installNotificationCallback(this.window))

    savedWindowState.manage(this.window)
    this.shouldMaximizeOnShow = savedWindowState.isMaximized

    const onBeforeQuit = () => {
      this.quitting = true
    }
    app.on('before-quit', onBeforeQuit)
    this.addCleanupTask(() => app.removeListener('before-quit', onBeforeQuit))

    this.window.on('close', e => {
      // On macOS, closing the window doesn't mean the app is quitting. If the
      // app is updating, we will prevent the window from closing only when the
      // app is also quitting.
      if (
        (!__DARWIN__ || this.quitting) &&
        !this.quittingEvenIfUpdating &&
        this.isDownloadingUpdate
      ) {
        e.preventDefault()
        ipcWebContents.send(this.window.webContents, 'show-installing-update')

        // Make sure the window is visible, so the user can see why we're
        // preventing the app from quitting. This is important on macOS, where
        // the window could be hidden/closed when the user tries to quit.
        // It could also happen on Windows if the user quits the app from the
        // task bar while it's in the background.
        this.show()
        return
      }

      if (this.shouldHideWindowInsteadOfClose()) {
        e.preventDefault()
        // https://github.com/desktop/desktop/issues/12838
        if (this.window.isFullScreen()) {
          this.window.setFullScreen(false)
          this.window.once('leave-full-screen', () => this.window.hide())
        } else {
          this.window.hide()
        }
        return
      }
    })

    this.window.on('closed', () => this.cleanup())
  }

  // Only hide the last window on macOS; close secondary windows to avoid leaks.
  private shouldHideWindowInsteadOfClose() {
    return (
      BrowserWindow.getAllWindows().length === 1 && __DARWIN__ && !this.quitting
    )
  }

  public load() {
    let startLoad = 0
    // We only listen for the first of the loading events to avoid a bug in
    // Electron/Chromium where they can sometimes fire more than once. See
    // See
    // https://github.com/desktop/desktop/pull/513#issuecomment-253028277. This
    // shouldn't really matter as in production builds loading _should_ only
    // happen once.
    this.window.webContents.once('did-start-loading', () => {
      this._rendererReadyTime = null
      this._loadTime = null

      startLoad = now()
    })

    this.window.webContents.once('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      this._loadTime = now() - startLoad

      this.maybeEmitDidLoad()
    })

    this.window.webContents.on('did-finish-load', () => {
      this.window.webContents.setVisualZoomLevelLimits(1, 1)
    })

    this.window.webContents.on('did-fail-load', () => {
      this.window.webContents.openDevTools()
      this.window.show()
    })

    const onRendererReady = (event: IpcMainEvent, readyTime: number) => {
      if (event.sender !== this.window.webContents) {
        return
      }

      this._rendererReadyTime = readyTime
      this.maybeEmitDidLoad()
      electronIpcMain.removeListener('renderer-ready', onRendererReady)
    }
    electronIpcMain.on('renderer-ready', onRendererReady)
    this.addCleanupTask(() =>
      electronIpcMain.removeListener('renderer-ready', onRendererReady)
    )

    const onBackgroundColorUpdated = (event: IpcMainEvent, color: string) => {
      if (event.sender !== this.window.webContents) {
        return
      }

      this.window.setBackgroundColor(color)
    }
    electronIpcMain.on(
      'update-window-background-color',
      onBackgroundColorUpdated
    )
    this.addCleanupTask(() =>
      electronIpcMain.removeListener(
        'update-window-background-color',
        onBackgroundColorUpdated
      )
    )

    this.window.on('focus', () =>
      ipcWebContents.send(this.window.webContents, 'focus')
    )
    this.window.on('blur', () =>
      ipcWebContents.send(this.window.webContents, 'blur')
    )

    registerWindowStateChangedEvents(this.window)

    // We want to have the locale country code available in the renderer on load
    // so that it can be used to try to deduce some sane date/time/number
    // formatting defaults. This is a bit of a hack but it avoids the need to
    // have an IPC round trip to get that information from the main process.
    const localeCountryCode = app.getLocaleCountryCode() ?? ''
    this.window.loadURL(
      encodePathAsUrl(__dirname, 'index.html') +
        `#lc=${encodeURIComponent(localeCountryCode)}`
    )

    const onNativeThemeUpdated = () => {
      ipcWebContents.send(this.window.webContents, 'native-theme-updated')
    }
    nativeTheme.addListener('updated', onNativeThemeUpdated)
    this.addCleanupTask(() =>
      nativeTheme.removeListener('updated', onNativeThemeUpdated)
    )

    this.setupAutoUpdater()
  }

  /**
   * Emit the `onDidLoad` event if the page has loaded and the renderer has
   * signalled that it's ready.
   */
  private maybeEmitDidLoad() {
    if (!this.rendererLoaded) {
      return
    }

    this.emitter.emit('did-load', null)
  }

  /** Is the page loaded and has the renderer signalled it's ready? */
  private get rendererLoaded(): boolean {
    return !!this.loadTime && !!this.rendererReadyTime
  }

  public get isLoaded(): boolean {
    return this.rendererLoaded
  }

  public onClosed(fn: () => void) {
    this.window.on('closed', fn)
  }

  /**
   * Register a function to call when the window is done loading. At that point
   * the page has loaded and the renderer has signalled that it is ready.
   */
  public onDidLoad(fn: () => void): Disposable {
    return this.emitter.on('did-load', fn)
  }

  public isMinimized() {
    return this.window.isMinimized()
  }

  /** Is the window currently visible? */
  public isVisible() {
    return this.window.isVisible()
  }

  public restore() {
    this.window.restore()
  }

  public isFocused() {
    return this.window.isFocused()
  }

  public get id() {
    return this.window.id
  }

  public focus() {
    this.window.focus()
  }

  public revealAndFocus() {
    if (this.window.isMinimized()) {
      this.window.restore()
    }

    if (!this.window.isVisible()) {
      this.show()
      return
    }

    this.window.focus()
  }

  public setTitle(title: string) {
    this.window.setTitle(title)
  }

  /** Selects all the windows web contents */
  public selectAllWindowContents() {
    this.window.webContents.selectAll()
  }

  /** Show the window. */
  public show() {
    this.window.show()
    if (this.shouldMaximizeOnShow) {
      // Only maximize the window the first time it's shown, not every time.
      // Otherwise, it causes the problem described in desktop/desktop#11590
      this.shouldMaximizeOnShow = false
      this.window.maximize()
    }
  }

  /** Send the menu event to the renderer. */
  public sendMenuEvent(name: MenuEvent) {
    this.show()

    ipcWebContents.send(this.window.webContents, 'menu-event', name)
  }

  /** Send the URL action to the renderer. */
  public sendURLAction(action: URLActionType) {
    this.show()

    ipcWebContents.send(this.window.webContents, 'url-action', action)
  }

  /** Send the URL action to the renderer. */
  public sendCLIAction(action: CLIAction) {
    this.show()

    ipcWebContents.send(this.window.webContents, 'cli-action', action)
  }

  /** Notify the renderer that accounts have changed. */
  public sendAccountsChanged(serializedUsers: string) {
    ipcWebContents.send(
      this.window.webContents,
      'accounts-changed',
      serializedUsers
    )
  }

  /** Send the app launch timing stats to the renderer. */
  public sendLaunchTimingStats(stats: ILaunchStats) {
    ipcWebContents.send(this.window.webContents, 'launch-timing-stats', stats)
  }

  /** Send the app menu to the renderer. */
  public sendAppMenu() {
    const appMenu = Menu.getApplicationMenu()
    if (appMenu) {
      const menu = menuFromElectronMenu(appMenu)
      ipcWebContents.send(this.window.webContents, 'app-menu', menu)
    }
  }

  /** Handle when a modal dialog is opened. */
  public dialogDidOpen() {
    if (this.window.isFocused()) {
      // No additional notifications are needed.
      return
    }
    // Care is taken to mimic OS dialog behaviors.
    if (__DARWIN__) {
      // macOS beeps when a modal dialog is opened.
      shell.beep()
      // See https://developer.apple.com/documentation/appkit/nsapplication/1428358-requestuserattention
      // "If the inactive app presents a modal panel, this method will be invoked with NSCriticalRequest
      // automatically. The modal panel is not brought to the front for an inactive app."
      // NOTE: flashFrame() uses the 'informational' level, so we need to explicitly bounce the dock
      // with the 'critical' level in order to that described behavior.
      app.dock?.bounce('critical')
    } else {
      // See https://learn.microsoft.com/en-us/windows/win32/uxguide/winenv-taskbar#taskbar-button-flashing
      // "If an inactive program requires immediate attention,
      // flash its taskbar button to draw attention and leave it highlighted."
      // It advises not to beep.
      this.window.once('focus', () => this.window.flashFrame(false))
      this.window.flashFrame(true)
    }
  }

  /** Send a certificate error to the renderer. */
  public sendCertificateError(
    certificate: Electron.Certificate,
    error: string,
    url: string
  ) {
    ipcWebContents.send(
      this.window.webContents,
      'certificate-error',
      certificate,
      error,
      url
    )
  }

  public showCertificateTrustDialog(
    certificate: Electron.Certificate,
    message: string
  ) {
    // The Electron type definitions don't include `showCertificateTrustDialog`
    // yet.
    const d = dialog as any
    d.showCertificateTrustDialog(
      this.window,
      { certificate, message },
      () => {}
    )
  }

  /**
   * Get the time (in milliseconds) spent loading the page.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get loadTime(): number | null {
    return this._loadTime
  }

  /**
   * Get the time (in milliseconds) elapsed from the renderer being loaded to it
   * signaling it was ready.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get rendererReadyTime(): number | null {
    return this._rendererReadyTime
  }

  public destroy() {
    this.window.destroy()
  }

  public setupAutoUpdater() {
    const onAutoUpdaterError = (error: Error) => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(this.window.webContents, 'auto-updater-error', error)
    }
    autoUpdater.on('error', onAutoUpdaterError)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('error', onAutoUpdaterError)
    )

    const onCheckingForUpdate = () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-checking-for-update'
      )
    }
    autoUpdater.on('checking-for-update', onCheckingForUpdate)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('checking-for-update', onCheckingForUpdate)
    )

    const onUpdateAvailable = () => {
      this.isDownloadingUpdate = true
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-available'
      )
    }
    autoUpdater.on('update-available', onUpdateAvailable)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-available', onUpdateAvailable)
    )

    const onUpdateNotAvailable = () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-not-available'
      )
    }
    autoUpdater.on('update-not-available', onUpdateNotAvailable)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-not-available', onUpdateNotAvailable)
    )

    const onUpdateDownloaded = () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-downloaded'
      )
    }
    autoUpdater.on('update-downloaded', onUpdateDownloaded)
    this.addCleanupTask(() =>
      autoUpdater.removeListener('update-downloaded', onUpdateDownloaded)
    )
  }

  public async checkForUpdates(url: string) {
    try {
      autoUpdater.setFeedURL({ url: await trySetUpdaterGuid(url) })
      autoUpdater.checkForUpdates()
    } catch (e) {
      return e
    }
    return undefined
  }

  public quitAndInstallUpdate() {
    autoUpdater.quitAndInstall()
  }

  public minimizeWindow() {
    this.window.minimize()
  }

  public maximizeWindow() {
    this.window.maximize()
  }

  public unmaximizeWindow() {
    this.window.unmaximize()
  }

  public closeWindow() {
    this.window.close()
  }

  public isMaximized() {
    return this.window.isMaximized()
  }

  public getCurrentWindowState() {
    return getWindowState(this.window)
  }

  public getCurrentWindowZoomFactor() {
    return this.window.webContents.zoomFactor
  }

  public setWindowZoomFactor(zoomFactor: number) {
    this.window.webContents.zoomFactor = zoomFactor
  }

  /**
   * Method to show the save dialog and return the first file path it returns.
   */
  public async showSaveDialog(options: Electron.SaveDialogOptions) {
    const { canceled, filePath } = await dialog.showSaveDialog(
      this.window,
      options
    )
    return !canceled && filePath !== undefined ? filePath : null
  }

  /**
   * Method to show the open dialog and return the first file path it returns.
   */
  public async showOpenDialog(options: Electron.OpenDialogOptions) {
    const { filePaths } = await dialog.showOpenDialog(this.window, options)
    return filePaths.length > 0 ? filePaths[0] : null
  }

  public markWillQuit() {
    this.quitting = true
  }

  public markWillQuitEvenIfUpdating() {
    this.quitting = true
    this.quittingEvenIfUpdating = true
  }

  public cancelQuitting() {
    this.quitting = false
    this.quittingEvenIfUpdating = false
  }

  private addCleanupTask(task: () => void) {
    this.cleanupTasks.push(task)
  }

  private cleanup() {
    for (const task of this.cleanupTasks.splice(0).reverse()) {
      task()
    }
  }
}

const trySetUpdaterGuid = async (url: string) => {
  try {
    const id = await getUpdaterGUID()
    if (!id) {
      return url
    }

    const parsed = new URL(url)
    parsed.searchParams.set('guid', id)
    return parsed.toString()
  } catch (e) {
    return url
  }
}
