import {BrowserWindow} from 'electron'

import Stats from './stats'

export default class AppWindow extends BrowserWindow {
  private stats: Stats

  public constructor(stats: Stats) {
    super({width: 800, height: 600, show: false, titleBarStyle: 'hidden'})

    this.stats = stats
  }

  public load() {
    let startLoad: number = null
    this.webContents.on('did-finish-load', () => {
      if (process.env.NODE_ENV === 'development') {
        this.webContents.openDevTools()
      }

      this.show()

      const now = Date.now()
      this.rendererLog(`Loading: ${now - startLoad}ms`)
      this.rendererLog(`Launch: ${now - this.stats.launchTime}ms`)
    })

    this.webContents.on('did-fail-load', () => {
      this.webContents.openDevTools()
      this.show()
    })

    startLoad = Date.now()
    this.loadURL(`file://${__dirname}/../../static/index.html`)
  }

  private rendererLog(msg: string) {
    this.webContents.send('log', msg)
  }
}
