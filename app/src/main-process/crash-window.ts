import { BrowserWindow, ipcMain } from 'electron'
import { Emitter, Disposable } from 'event-kit'
import { logInfo, logError } from '../lib/logging/main'
import { ICrashDetails, ErrorType } from '../crash/shared'

const minWidth = 800
const minHeight = 600

export class CrashWindow {
  private readonly window: Electron.BrowserWindow
  private readonly emitter = new Emitter()
  private readonly errorType: ErrorType
  private readonly error: Error

  private _loadTime: number | null = null
  private _rendererReadyTime: number | null = null

  public constructor(errorType: ErrorType, error: Error) {
    const windowOptions: Electron.BrowserWindowOptions = {
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
        // Enable, among other things, the ResizeObserver
        experimentalFeatures: true,
      },
    }

    // if (__DARWIN__) {
    //     windowOptions.titleBarStyle = 'hidden'
    // } else if (__WIN32__) {
    //     windowOptions.frame = false
    // }

    this.window = new BrowserWindow(windowOptions)
    this.error = error
    this.errorType = errorType
  }

  public load() {
    logInfo('Starting crash process')
    let startLoad = 0
    // We only listen for the first of the loading events to avoid a bug in
    // Electron/Chromium where they can sometimes fire more than once. See
    // See
    // https://github.com/desktop/desktop/pull/513#issuecomment-253028277. This
    // shouldn't really matter as in production builds loading _should_ only
    // happen once.
    this.window.webContents.once('did-start-loading', () => {
      logInfo('Crash process in startup')
      this._rendererReadyTime = null
      this._loadTime = null

      startLoad = Date.now()
    })

    this.window.webContents.once('did-finish-load', () => {
      logInfo('Crash process started')
      if (process.env.NODE_ENV === 'development') {
        this.window.webContents.openDevTools()
      }

      const now = Date.now()
      this._loadTime = now - startLoad

      this.maybeEmitDidLoad()
    })

    this.window.webContents.on('did-finish-load', () => {
      this.window.webContents.setVisualZoomLevelLimits(1, 1)
    })

    this.window.webContents.on('did-fail-load', () => {
      logError('Crash process failed to load')
      if (__DEV__) {
        this.window.webContents.openDevTools()
        this.window.show()
      } else {
        this.emitter.emit('did-fail-load', null)
      }
    })

    ipcMain.on('crash-ready', (event: Electron.IpcMainEvent, readyTime: number) => {
      logError(`Crash process is ready after ${readyTime}ms`)
      this._rendererReadyTime = readyTime
      this.sendError()
      this.maybeEmitDidLoad()
    })

    this.window.loadURL(`file://${__dirname}/crash.html`)
  }

  /**
   * Emit the `onDidLoad` event if the page has loaded and the renderer has
   * signalled that it's ready.
   */
  private maybeEmitDidLoad() {
    if (!this.rendererLoaded) { return }

    this.emitter.emit('did-load', null)
  }

  /** Is the page loaded and has the renderer signalled it's ready? */
  private get rendererLoaded(): boolean {
    return this.loadTime !== null && this.rendererReadyTime !== null
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
    logError('Showing crash process window')
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

  /** Report an auto updater error to the renderer. */
  public sendAutoUpdaterError(error: Error) {
    // `Error` can't be JSONified so it doesn't transport nicely over IPC. So
    // we'll just manually copy the properties we care about.
    const friendlyError = {
      stack: error.stack,
      message: error.message,
      name: error.name,
    }
    this.window.webContents.send('auto-updater-error', friendlyError)
  }

  /**
   * Get the time (in milliseconds) spent loading the page.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get loadTime(): number | null {
    return this._loadTime
  }

  /**
   * Get the time (in milliseconds) elapsed from the renderer being loaded to it
   * signaling it was ready.
   *
   * This will be `null` until `onDidLoad` is called.
   */
  public get rendererReadyTime(): number | null {
    return this._rendererReadyTime
  }

  public destroy() {
    this.window.destroy()
  }
}
