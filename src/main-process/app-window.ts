import {BrowserWindow} from 'electron'

import Stats from './stats'
import {URLActionType} from '../lib/parse-url'
import {WindowState} from '../lib/window-state'

export default class AppWindow {
  private window: Electron.BrowserWindow
  private stats: Stats

  public constructor(stats: Stats) {

    const windowOptions: Electron.BrowserWindowOptions = {
      width: 800,
      height: 600,
      show: false,
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff'
    }

    if (process.platform === 'darwin') {
        windowOptions.titleBarStyle = 'hidden'
    } else if (process.platform === 'win32') {
        windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)

    this.window.on('enter-full-screen', () => this.send('enter-full-screen', null))
    this.window.on('leave-full-screen', () => this.send('leave-full-screen', null))

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
      this.rendererLog(`Loading: ${now - startLoad}ms`)
    })

    this.window.webContents.on('did-fail-load', () => {
      this.window.webContents.openDevTools()
      this.window.show()
    })

    this.registerWindowStateChangedEvents()

    this.window.loadURL(`file://${__dirname}/../../index.html`)
  }

  private registerWindowStateChangedEvents() {

    const windowStateEvents = [
      'enter-full-screen',
      'leave-full-screen',
      'maximize',
      'minimize',
      'unmaximize',
      'restore'
    ]

    for (const eventName of windowStateEvents) {
      this.window.on(eventName, this.sendWindowStateEvent)
    }
  }

  private getWindowState(): WindowState {
    if (this.window.isFullScreen()) {
      return 'full-screen'
    } else if (this.window.isMaximized()) {
      return 'maximized'
    } else if (this.window.isMinimized()) {
      return 'minimized'
    } else {
      return 'normal'
    }
  }

  private sendWindowStateEvent = () => {
    this.send('window-state-changed', this.getWindowState())
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

  private rendererLog(msg: string) {
    this.send('log', msg)
  }

  private send(channel: string, args: any) {
    this.window.webContents.send(channel, args)
  }
}
