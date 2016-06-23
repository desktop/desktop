import {BrowserWindow, ipcMain} from 'electron'

import Stats from './stats'
import {URLActionType} from '../lib/parse-url'
import {WindowState} from '../lib/window-state'
import {IPCLogEntry} from '../lib/ipc-log-entry'
import {buildDefaultMenu} from './menu'

export default class AppWindow {
  private window: Electron.BrowserWindow
  private stats: Stats
  private logQueue: IPCLogEntry[]
  private loaded: boolean

  public constructor(stats: Stats) {
    this.logQueue = []
    this.loaded = false

    const windowOptions: Electron.BrowserWindowOptions = {
      width: 800,
      height: 600,
      show: false,
      // This fixes subpixel aliasing on Windows`
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff'
    }

    if (process.platform === 'darwin') {
        windowOptions.titleBarStyle = 'hidden'
    } else if (process.platform === 'win32') {
        windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)

    this.stats = stats
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
      this.console.log(`Loading: ${now - startLoad}ms`)

      this.loaded = true
      this.flushLogQueue()
    })

    this.window.webContents.on('did-fail-load', () => {
      this.window.webContents.openDevTools()
      this.window.show()
    })

    this.registerWindowStateChangedEvents()

    // We don't have a menu bar on windows so we'll cheat
    // for nor and make right-clicking on the title bar
    // show the default menu as a context menu instead.
    if (process.platform === 'win32') {
      const menu = buildDefaultMenu()

      ipcMain.on('show-popup-app-menu', (e, ...args) => {
        menu.popup(this.window)
      })
    }

    this.window.loadURL(`file://${__dirname}/../../index.html`)
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
    this.send('window-state-changed', state)
  }

  public onClose(fn: () => void) {
    this.window.on('closed', fn)
  }

  public sendURLAction(action: URLActionType) {
    this.send('url-action', action)
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

  public get console() {
    return {
      log: (msg: string) => {
        this.logQueue.push({msg, type: 'log'})
        this.flushLogQueue()
      },
      error: (msg: string) => {
        this.logQueue.push({msg, type: 'error'})
        this.flushLogQueue()
      }
    }
  }

  private flushLogQueue() {
    if (!this.loaded) { return }

    for (const log of this.logQueue) {
      this.send('log', log)
    }
    this.logQueue = []
  }

  private send(channel: string, args: any) {
    this.window.webContents.send(channel, args)
  }
}
