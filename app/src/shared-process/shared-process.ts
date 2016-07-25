import {ipcMain, BrowserWindow} from 'electron'
import {IMessage} from './message'
import {URLActionType} from '../lib/parse-url'

/**
 * The SharedProcess acts as the owner of all shared state across the app. Most
 * communication with it will originate in the Dispatcher.
 */
export default class SharedProcess {
  private window: Electron.BrowserWindow
  private loaded = false
  private messageQueue: IMessage[] = []

  public constructor() {
    this.window = new BrowserWindow({
      width: 100,
      height: 100,
      show: false,
      title: 'SharedProcess'
    })

    this.window.webContents.on('did-finish-load', () => {
      this.loaded = true
      this.drainMessageQueue()
    })

    this.window.loadURL(`file://${__dirname}/shared.html`)
  }

  public show() {
    this.window.webContents.openDevTools({ mode: 'detach' })
  }

  /** Register the shared process to receive requests. */
  public register() {
    ipcMain.on('shared/request', (event, args) => {
      const message: IMessage = args[0]
      this.send(message)
    })
  }

  /** Send a message to the shared process' renderer. */
  public send(msg: IMessage) {
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
        // Pop the console whenever we see an error (in dev)
        if (process.env.NODE_ENV === 'development') {
          this.show()
        }
        this.send({guid: '', name: 'console.error', args: {args}})
      }
    }
  }
}
