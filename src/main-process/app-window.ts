import {BrowserWindow, ipcMain} from 'electron'

import Stats from './stats'
import SharedProcess from '../shared-process/shared-process'
import {WindowState, windowStateChannelName} from '../lib/window-state'
import {buildDefaultMenu} from './menu'

const windowStateKeeper:
  (opts: ElectronWindowState.WindowStateKeeperOptions) => ElectronWindowState.WindowState =
  require('electron-window-state')

export default class AppWindow {
  private window: Electron.BrowserWindow
  private sharedProcess: SharedProcess
  private stats: Stats

  public constructor(stats: Stats, sharedProcess: SharedProcess) {

    const savedWindowState: ElectronWindowState.WindowState = windowStateKeeper({
      defaultWidth: 800,
      defaultHeight: 600
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
      backgroundColor: '#fff'
    }

    if (process.platform === 'darwin') {
        windowOptions.titleBarStyle = 'hidden-inset'
    } else if (process.platform === 'win32') {
        windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)
    savedWindowState.manage(this.window)

    this.stats = stats

    this.sharedProcess = sharedProcess
  }

  public load() {
    let startLoad: number = null
    this.window.webContents.on('did-start-loading', () => {
      startLoad = Date.now()
    })

    this.window.webContents.on('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      this.window.show()

      const now = Date.now()
      this.sharedProcess.console.log(`Loading: ${now - startLoad}ms`)
    })

    this.window.webContents.on('did-fail-load', () => {
      this.window.webContents.openDevTools()
      this.window.show()
    })

    this.registerWindowStateChangedEvents()

    // We don't have a menu bar on windows so we'll cheat
    // for now and make right-clicking on the title bar
    // show the default menu as a context menu instead.
    if (process.platform === 'win32') {
      const menu = buildDefaultMenu(this.sharedProcess)

      ipcMain.on('show-popup-app-menu', (e, ...args) => {
        menu.popup(this.window)
      })
    }

    this.window.loadURL(`file://${__dirname}/index.html`)
  }

  /* Set up message passing to the render process whenever the window
   * state changes. We've definied 'window state' as one of minimized,
   * normal, maximized and full-screen. These states will be sent
   * over the window-state-changed channel
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

  /* Short hand convenience function for sending a window state change event
   * over the window-state-changed channel to the render process.
   */
  private sendWindowStateEvent(state: WindowState) {
    this.window.webContents.send(windowStateChannelName, state)
  }

  public onClose(fn: () => void) {
    this.window.on('closed', fn)
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
}
