import {
  Menu,
  app,
  dialog,
  BrowserWindow,
  autoUpdater,
  nativeTheme,
} from 'electron'
import { Emitter, Disposable } from 'event-kit'
import { join } from 'path'
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
import windowStateKeeper from 'electron-window-state'
import * as ipcMain from './ipc-main'
import * as ipcWebContents from './ipc-webcontents'
import {
  installNotificationCallback,
  terminateDesktopNotifications,
} from './notifications'
import { addTrustedIPCSender } from './trusted-ipc-sender'

export class AppWindow {
  private window: Electron.BrowserWindow
  private emitter = new Emitter()

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null
  private isDownloadingUpdate: boolean = false

  private minWidth = 960
  private minHeight = 660

  // See https://github.com/desktop/desktop/pull/11162
  private shouldMaximizeOnShow = false

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
      windowOptions.icon = join(__dirname, 'static', 'logos', '512x512.png')

      // relax restriction here for users trying to run app at a small
      // resolution and any other side-effects of dropping this restriction are
      // currently unsupported
      delete windowOptions.minHeight
      delete windowOptions.minWidth
    }

    this.window = new BrowserWindow(windowOptions)
    addTrustedIPCSender(this.window.webContents)

    installNotificationCallback(this.window)

    savedWindowState.manage(this.window)
    this.shouldMaximizeOnShow = savedWindowState.isMaximized

    let quitting = false
    let quittingEvenIfUpdating = false
    app.on('before-quit', () => {
      quitting = true
    })

    ipcMain.on('will-quit', event => {
      quitting = true
      event.returnValue = true
    })

    ipcMain.on('will-quit-even-if-updating', event => {
      quitting = true
      quittingEvenIfUpdating = true
      event.returnValue = true
    })

    ipcMain.on('cancel-quitting', event => {
      quitting = false
      quittingEvenIfUpdating = false
      event.returnValue = true
    })

    this.window.on('close', e => {
      // On macOS, closing the window doesn't mean the app is quitting. If the
      // app is updating, we will prevent the window from closing only when the
      // app is also quitting.
      if (
        (!__DARWIN__ || quitting) &&
        !quittingEvenIfUpdating &&
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

      // on macOS, when the user closes the window we really just hide it. This
      // lets us activate quickly and keep all our interesting logic in the
      // renderer.
      if (__DARWIN__ && !quitting) {
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
      nativeTheme.removeAllListeners()
      autoUpdater.removeAllListeners()
      terminateDesktopNotifications()
    })

    if (__WIN32__) {
      // workaround for known issue with fullscreen-ing the app and restoring
      // is that some Chromium API reports the incorrect bounds, so that it
      // will leave a small space at the top of the screen on every other
      // maximize
      //
      // adapted from https://github.com/electron/electron/issues/12971#issuecomment-403956396
      //
      // can be tidied up once https://github.com/electron/electron/issues/12971
      // has been confirmed as resolved
      this.window.once('ready-to-show', () => {
        this.window.on('unmaximize', () => {
          setTimeout(() => {
            const bounds = this.window.getBounds()
            bounds.width += 1
            this.window.setBounds(bounds)
            bounds.width -= 1
            this.window.setBounds(bounds)
          }, 5)
        })
      })
    }
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

    // TODO: This should be scoped by the window.
    ipcMain.once('renderer-ready', (_, readyTime) => {
      this._rendererReadyTime = readyTime
      this.maybeEmitDidLoad()
    })

    this.window.on('focus', () =>
      ipcWebContents.send(this.window.webContents, 'focus')
    )
    this.window.on('blur', () =>
      ipcWebContents.send(this.window.webContents, 'blur')
    )

    registerWindowStateChangedEvents(this.window)
    this.window.loadURL(encodePathAsUrl(__dirname, 'index.html'))

    nativeTheme.addListener('updated', (event: string, userInfo: any) => {
      ipcWebContents.send(this.window.webContents, 'native-theme-updated')
    })

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

  public focus() {
    this.window.focus()
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
    autoUpdater.on('error', (error: Error) => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(this.window.webContents, 'auto-updater-error', error)
    })

    autoUpdater.on('checking-for-update', () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-checking-for-update'
      )
    })

    autoUpdater.on('update-available', () => {
      this.isDownloadingUpdate = true
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-available'
      )
    })

    autoUpdater.on('update-not-available', () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-not-available'
      )
    })

    autoUpdater.on('update-downloaded', () => {
      this.isDownloadingUpdate = false
      ipcWebContents.send(
        this.window.webContents,
        'auto-updater-update-downloaded'
      )
    })
  }

  public checkForUpdates(url: string) {
    try {
      autoUpdater.setFeedURL({ url })
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
}
