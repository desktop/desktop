import { BrowserWindow, ipcMain } from 'electron'
import { Emitter, Disposable } from 'event-kit'
import { ICrashDetails, ErrorType } from '../crash/shared'
import { registerWindowStateChangedEvents } from '../lib/window-state'

const minWidth = 600
const minHeight = 500

/**
 * A wrapper around the BrowserWindow instance for our crash process.
 *
 * The crash process is responsible for presenting the user with an
 * error after the main process or any renderer process has crashed due
 * to an uncaught exception or when the main renderer has failed to load.
 */
export class CrashWindow {
  private readonly window: Electron.BrowserWindow
  private readonly emitter = new Emitter()
  private readonly errorType: ErrorType
  private readonly error: Error

  private hasFinishedLoading = false
  private hasSentReadyEvent = false

  public constructor(errorType: ErrorType, error: Error) {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      width: minWidth,
      height: minHeight,
      minWidth: minWidth,
      minHeight: minHeight,
      show: false,
      // This fixes subpixel aliasing on Windows
      // See https://github.com/atom/atom/commit/683bef5b9d133cb194b476938c77cc07fd05b972
      backgroundColor: '#fff',
      webPreferences: {
        // Disable auxclick event
        // See https://developers.google.com/web/updates/2016/10/auxclick
        disableBlinkFeatures: 'Auxclick',
        nodeIntegration: true,
        spellcheck: false,
      },
    }

    if (__DARWIN__) {
      windowOptions.titleBarStyle = 'hidden'
    } else if (__WIN32__) {
      windowOptions.frame = false
    }

    this.window = new BrowserWindow(windowOptions)
    this.error = error
    this.errorType = errorType
  }

  public load() {
    log.debug('Starting crash process')

    // We only listen for the first of the loading events to avoid a bug in
    // Electron/Chromium where they can sometimes fire more than once. See
    // See
    // https://github.com/desktop/desktop/pull/513#issuecomment-253028277. This
    // shouldn't really matter as in production builds loading _should_ only
    // happen once.
    this.window.webContents.once('did-start-loading', () => {
      log.debug('Crash process in startup')
    })

    this.window.webContents.once('did-finish-load', () => {
      log.debug('Crash process started')
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      this.hasFinishedLoading = true
      this.maybeEmitDidLoad()
    })

    this.window.webContents.on('did-finish-load', () => {
      this.window.webContents.setVisualZoomLevelLimits(1, 1)
    })

    this.window.webContents.on('did-fail-load', () => {
      log.error('Crash process failed to load')
      if (__DEV__) {
        this.window.webContents.openDevTools()
        this.window.show()
      } else {
        this.emitter.emit('did-fail-load', null)
      }
    })

    ipcMain.on('crash-ready', (event: Electron.IpcMainEvent) => {
      log.debug(`Crash process is ready`)

      this.hasSentReadyEvent = true

      this.sendError()
      this.maybeEmitDidLoad()
    })

    ipcMain.on('crash-quit', (event: Electron.IpcMainEvent) => {
      log.debug('Got quit signal from crash process')
      this.window.close()
    })

    registerWindowStateChangedEvents(this.window)

    this.window.loadURL(`file://${__dirname}/crash.html`)
  }

  /**
   * Emit the `onDidLoad` event if the page has loaded and the renderer has
   * signalled that it's ready.
   */
  private maybeEmitDidLoad() {
    if (this.hasFinishedLoading && this.hasSentReadyEvent) {
      this.emitter.emit('did-load', null)
    }
  }

  public onClose(fn: () => void) {
    this.window.on('closed', fn)
  }

  public onFailedToLoad(fn: () => void) {
    this.emitter.on('did-fail-load', fn)
  }

  /**
   * Register a function to call when the window is done loading. At that point
   * the page has loaded and the renderer has signalled that it is ready.
   */
  public onDidLoad(fn: () => void): Disposable {
    return this.emitter.on('did-load', fn)
  }

  public focus() {
    this.window.focus()
  }

  /** Show the window. */
  public show() {
    log.debug('Showing crash process window')
    this.window.show()
  }

  /** Report the error to the renderer. */
  private sendError() {
    // `Error` can't be JSONified so it doesn't transport nicely over IPC. So
    // we'll just manually copy the properties we care about.
    const friendlyError = {
      stack: this.error.stack,
      message: this.error.message,
      name: this.error.name,
    }

    const details: ICrashDetails = {
      type: this.errorType,
      error: friendlyError,
    }

    this.window.webContents.send('error', details)
  }

  public destroy() {
    this.window.destroy()
  }
}
