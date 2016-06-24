import {ipcMain, BrowserWindow} from 'electron'
import {Message} from './message'

export default class SharedProcess {
  private window: Electron.BrowserWindow
  private loaded = false
  private messageQueue: Message[] = []

  public constructor() {
    this.window = new BrowserWindow({
      width: 800,
      height: 600,
      show: false,
      title: 'SharedProcess'
    })

    this.window.webContents.on('did-finish-load', () => {
      this.loaded = true
      this.drainMessageQueue()
    })

    this.window.loadURL(`file://${__dirname}/../../shared.html`)

    if (process.env.NODE_ENV === 'development') {
      this.window.show()
      this.window.webContents.openDevTools()
    }
  }

  public register() {
    ipcMain.on('shared/request', (event, args) => {
      const message: Message = args[0]
      this.send(message)
    })
  }

  public send(msg: Message) {
    this.messageQueue.push(msg)
    this.drainMessageQueue()
  }

  private drainMessageQueue() {
    if (!this.loaded) { return }

    for (const msg of this.messageQueue) {
      this.window.webContents.send('shared/request', [msg])
    }

    this.messageQueue = []
  }
}
