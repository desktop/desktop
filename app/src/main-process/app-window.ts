import { BrowserWindow, ipcMain, Menu, app, dialog } from 'electron'
import { Emitter, Disposable } from 'event-kit'

import { SharedProcess } from '../shared-process/shared-process'
import { WindowState, windowStateChannelName } from '../lib/window-state'
import { MenuEvent } from './menu'
import { URLActionType } from '../lib/parse-url'
import { ILaunchStats } from '../lib/stats'
import { menuFromElectronMenu } from '../models/app-menu'

let windowStateKeeper: any | null = null

export class AppWindow {
  private window: Electron.BrowserWindow
  private sharedProcess: SharedProcess
  private emitter = new Emitter()

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null

  private minWidth = 960
  private minHeight = 660

  public constructor(sharedProcess: SharedProcess) {
    if (!windowStateKeeper) {
      // `electron-window-state` requires Electron's `screen` module, which can
      // only be required after the app has emitted `ready`. So require it
      // lazily.
      windowStateKeeper = require('electron-window-state')
    }

    const savedWindowState = windowStateKeeper({
      defaultWidth: this.minWidth,
      defaultHeight: this.minHeight,
    })

    const windowOptions: Electron.BrowserWindowOptions = {
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
        // Enable, among other things, the ResizeObserver
        experimentalFeatures: true,
      },
    }

    if (__DARWIN__) {
        windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
        windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)
    savedWindowState.manage(this.window)

    let quitting = false
    app.on('before-quit', () => {
      quitting = true
    })

    ipcMain.on('will-quit', (event: Electron.IpcMainEvent) => {
      quitting = true
      event.returnValue = true
    })

    // on macOS, when the user closes the window we really just hide it. This
    // lets us activate quickly and keep all our interesting logic in the
    // renderer.
    if (__DARWIN__) {
      this.window.on('close', e => {
        if (!quitting) {
          e.preventDefault()
          this.window.hide()
        }
      })
    }

    this.sharedProcess = sharedProcess
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

      startLoad = Date.now()
    })

    this.window.webContents.once('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      const now = Date.now()
      this._loadTime = now - startLoad

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
    ipcMain.once('renderer-ready', (event: Electron.IpcMainEvent, readyTime: number) => {
      this._rendererReadyTime = readyTime

      this.maybeEmitDidLoad()
    })

    this.window.on('focus', () => this.window.webContents.send('focus'))
    this.window.on('blur', () => this.window.webContents.send('blur'))

    this.registerWindowStateChangedEvents()

    this.window.loadURL(`file://${__dirname}/index.html`)
  }

  /**
   * Emit the `onDidLoad` event if the page has loaded and the renderer has
   * signalled that it's ready.
   */
  private maybeEmitDidLoad() {
    if (!this.rendererLoaded) { return }

    this.emitter.emit('did-load', null)
  }

  /** Is the page loaded and has the renderer signalled it's ready? */
  private get rendererLoaded(): boolean {
    return !!this.loadTime && !!this.rendererReadyTime
  }

  /**
   * Sets up message passing to the render process when the window state changes.
   *
   * We've definied 'window state' as one of minimized, normal, maximized, and
   * full-screen. These states will be sent over the window-state-changed channel
   */
  private registerWindowStateChangedEvents() {
    this.window.on('enter-full-screen', () => this.sendWindowStateEvent('full-screen'))

    // So this is a bit of a hack. If we call window.isFullScreen directly after
    // receiving the leave-full-screen event it'll return true which isn't what
    // we're after. So we'll say that we're transitioning to 'normal' even though
    // we might be maximized. This works because electron will emit a 'maximized'
    // event after 'leave-full-screen' if the state prior to full-screen was maximized.
    this.window.on('leave-full-screen', () => this.sendWindowStateEvent('normal'))

    this.window.on('maximize', () => this.sendWindowStateEvent('maximized'))
    this.window.on('minimize', () => this.sendWindowStateEvent('minimized'))
    this.window.on('unmaximize', () => this.sendWindowStateEvent('normal'))
    this.window.on('restore', () => this.sendWindowStateEvent('normal'))
    this.window.on('hide', () => this.sendWindowStateEvent('hidden'))
    this.window.on('show', () => this.sendWindowStateEvent('normal'))
  }

  /**
   * Short hand convenience function for sending a window state change event
   * over the window-state-changed channel to the render process.
   */
  private sendWindowStateEvent(state: WindowState) {
    this.window.webContents.send(windowStateChannelName, state)
  }

  public onClose(fn: () => void) {
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

  public restore() {
    this.window.restore()
  }

  public focus() {
    this.window.focus()
  }

  /** Show the window. */
  public show() {
    this.window.show()
  }

  /** Send the menu event to the renderer. */
  public sendMenuEvent(name: MenuEvent) {
    this.show()

    this.window.webContents.send('menu-event', { name })
  }

  /** Send the URL action to the renderer. */
  public sendURLAction(action: URLActionType) {
    this.show()

    this.window.webContents.send('url-action', { action })
  }

  /** Send the app launch timing stats to the renderer. */
  public sendLaunchTimingStats(stats: ILaunchStats) {
    this.window.webContents.send('launch-timing-stats', { stats })
  }

  /** Send the app menu to the renderer. */
  public sendAppMenu() {
    const appMenu = Menu.getApplicationMenu()
    if (appMenu) {
      const menu = menuFromElectronMenu(appMenu)
      this.window.webContents.send('app-menu', { menu })
    }
  }

  /** Send a certificate error to the renderer. */
  public sendCertificateError(certificate: Electron.Certificate, error: string, url: string) {
    this.window.webContents.send('certificate-error', { certificate, error, url })
  }

  public showCertificateTrustDialog(certificate: Electron.Certificate, message: string) {
    // The Electron type definitions don't include `showCertificateTrustDialog`
    // yet.
    const d = dialog as any
    d.showCertificateTrustDialog(this.window, { certificate, message }, () => {})
  }

  /** Report the exception to the renderer. */
  public sendException(error: Error) {
    // `Error` can't be JSONified so it doesn't transport nicely over IPC. So
    // we'll just manually copy the properties we care about.
    const friendlyError = {
      stack: error.stack,
      message: error.message,
      name: error.name,
    }
    this.window.webContents.send('main-process-exception', friendlyError)
  }

  /** Report an auto updater error to the renderer. */
  public sendAutoUpdaterError(error: Error) {
    // `Error` can't be JSONified so it doesn't transport nicely over IPC. So
    // we'll just manually copy the properties we care about.
    const friendlyError = {
      stack: error.stack,
      message: error.message,
      name: error.name,
    }
    this.window.webContents.send('auto-updater-error', friendlyError)
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
}
