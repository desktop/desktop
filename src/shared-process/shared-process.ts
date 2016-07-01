import {ipcMain, BrowserWindow} from 'electron'
import {Message} from './message'
import {URLActionType} from '../lib/parse-url'

/**
 * The SharedProcess acts as the owner of all shared state across the app. Most
 * communication with it will originate in the Dispatcher.
 */
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

    this.window.loadURL(`file://${__dirname}/shared.html`)

    if (process.env.NODE_ENV === 'development') {
      this.window.show()
      this.window.webContents.openDevTools()
    }
  }

  /** Register the shared process to receive requests. */
  public register() {
    ipcMain.on('shared/request', (event, args) => {
      const message: Message = args[0]
      this.send(message)
    })
  }

  /** Send a message to the shared process' renderer. */
  public send(msg: Message) {
    this.messageQueue.push(msg)
    this.drainMessageQueue()
  }

  /** Send a URL action to the shared process' renderer to handle. */
  public sendURLAction(action: URLActionType) {
    this.send({guid: '', name: 'url-action', args: {action}})
  }

  private drainMessageQueue() {
    if (!this.loaded) { return }

    for (const msg of this.messageQueue) {
      this.window.webContents.send('shared/request', [msg])
    }

    this.messageQueue = []
  }

  /** Log to the shared process' renderer. */
  public get console() {
    return {
      log: (...args: any[]) => {
        this.send({guid: '', name: 'console.log', args: {args}})
      },
      error: (...args: any[]) => {
        this.send({guid: '', name: 'console.error', args: {args}})
      }
    }
  }
}
