import { BrowserWindow, ipcMain, Menu, app } from 'electron'
import { Emitter, Disposable } from 'event-kit'

import { SharedProcess } from '../shared-process/shared-process'
import { WindowState, windowStateChannelName } from '../lib/window-state'
import { MenuEvent } from './menu'
import { URLActionType } from '../lib/parse-url'
import { ILaunchStats } from '../lib/stats'
import { menuFromElectronMenu } from '../models/app-menu'

import * as Path from 'path'
import * as Fs from 'fs'

let windowStateKeeper: any | null = null

// NOTE:
// This is a workaround for an upstream issue with electron-window-state
// where a null x/y will crash screen.getDisplayMatching() before our app
// can launch correctly.
//
// This can be removed after we've updated our beta users to electron-window-state@4.0.1
// which will serialize 0 correctly again. See the upstream PR:
// https://github.com/mawie81/electron-window-state/pull/16/
function sanitizeBeforeReadingSync() {
  const userData = app.getPath('userData')
  const file = 'window-state.json'
  const filePath = Path.join(userData, file)

  try {
    const text = Fs.readFileSync(filePath, 'utf-8')
    if (text.length) {
      const json = JSON.parse(text)

      if (json.x === null || json.x === null) {
        json.x = json.x || 0
        json.y = json.y || 0
        const newContents = JSON.stringify(json)
        Fs.writeFileSync(filePath, newContents)
      }
    }
  } catch (e) {
    // swallow this error, live a happy life
  }
}

export class AppWindow {
  private window: Electron.BrowserWindow
  private sharedProcess: SharedProcess
  private emitter = new Emitter()

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null

  public constructor(sharedProcess: SharedProcess) {
    if (!windowStateKeeper) {
      // `electron-window-state` requires Electron's `screen` module, which can
      // only be required after the app has emitted `ready`. So require it
      // lazily.
      windowStateKeeper = require('electron-window-state')
    }

    sanitizeBeforeReadingSync()

    const savedWindowState = windowStateKeeper({
      defaultWidth: 800,
      defaultHeight: 600,
    })

    const windowOptions: Electron.BrowserWindowOptions = {
      x: savedWindowState.x,
      y: savedWindowState.y,
      width: savedWindowState.width,
      height: savedWindowState.height,
      minWidth: 800,
      minHeight: 600,
      show: false,
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff',
      webPreferences: {
        // Disable auxclick event
        // See https://developers.google.com/web/updates/2016/10/auxclick
        disableBlinkFeatures: 'Auxclick',
      },
    }

    if (__DARWIN__) {
        windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
        windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)
    savedWindowState.manage(this.window)

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
    this.window.webContents.send('menu-event', { name })
  }

  /** Send the URL action to the renderer. */
  public sendURLAction(action: URLActionType) {
    this.window.webContents.send('url-action', { action })
  }

  /** Send the app launch timing stats to the renderer. */
  public sendLaunchTimingStats(stats: ILaunchStats) {
    this.window.webContents.send('launch-timing-stats', { stats })
  }

  /** Send the app menu to the renderer. */
  public sendAppMenu() {
    const menu = menuFromElectronMenu(Menu.getApplicationMenu())
    this.window.webContents.send('app-menu', { menu })
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
