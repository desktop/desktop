import {BrowserWindow} from 'electron'

import Stats from './stats'
import {URLActionType} from '../lib/parse-url'

export interface IPCLogEntry {
  msg: string
  type: 'log' | 'error'
}

export default class AppWindow {
  private window: Electron.BrowserWindow
  private stats: Stats
  private logQueue: IPCLogEntry[]
  private loaded: boolean

  public constructor(stats: Stats) {
    this.logQueue = []
    this.loaded = false

    this.window = new BrowserWindow(
    {
      width: 800,
      height: 600,
      show: false,
      titleBarStyle: 'hidden',
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff'
    })

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

    this.window.loadURL(`file://${__dirname}/../../static/index.html`)
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
