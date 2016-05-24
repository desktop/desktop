import {BrowserWindow} from 'electron'

import Stats from './stats'

export default class AppWindow {
  private window: Electron.BrowserWindow
  private stats: Stats

  public constructor(stats: Stats) {
    this.window = new BrowserWindow({width: 800, height: 600, show: false, titleBarStyle: 'hidden'})

    this.stats = stats
  }

  public load() {
    let startLoad: number = null
    this.window.webContents.on('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      this.window.show()

      const now = Date.now()
      this.rendererLog(`Loading: ${now - startLoad}ms`)
      this.rendererLog(`Launch: ${now - this.stats.launchTime}ms`)
    })

    this.window.webContents.on('did-fail-load', () => {
      this.window.webContents.openDevTools()
      this.window.show()
    })

    startLoad = Date.now()
    this.window.loadURL(`file://${__dirname}/../../static/index.html`)
  }

  public onClose(fn: () => void) {
    this.window.on('closed', fn)
  }

  private rendererLog(msg: string) {
    this.window.webContents.send('log', msg)
  }
}
