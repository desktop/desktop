import {BrowserWindow} from 'electron'

import Stats from './stats'

export default class AppWindow {
  private window: Electron.BrowserWindow
  private stats: Stats

  public constructor(stats: Stats) {

    this.window = new BrowserWindow(
    {
      width: 800,
      height: 600,
      show: false,
      titleBarStyle: 'hidden',
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: "#fff"
    })

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
