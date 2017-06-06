import '../lib/logging/main/install'

import { app, Menu, MenuItem, ipcMain, BrowserWindow, autoUpdater, dialog } from 'electron'

import { AppWindow } from './app-window'
import { CrashWindow } from './crash-window'
import { buildDefaultMenu, MenuEvent, findMenuItemByID, setCrashMenu } from './menu'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { parseURL } from '../lib/parse-url'
import { handleSquirrelEvent } from './squirrel-updater'
import { SharedProcess } from '../shared-process/shared-process'
import { fatalError } from '../lib/fatal-error'

import { IMenuItemState } from '../lib/menu-update'
import { LogLevel } from '../lib/logging/log-level'
import { log as writeLog } from './log'
import { formatError } from '../lib/logging/format-error'
import { reportError } from './exception-reporting'
import { enableSourceMaps, withSourceMappedStack } from '../lib/source-map-support'
import { now } from './now'

enableSourceMaps()

let mainWindow: AppWindow | null = null
let sharedProcess: SharedProcess | null = null

const launchTime = now()

let preventQuit = false
let readyTime: number | null = null
let hasReportedUncaughtException = false

type OnDidLoadFn = (window: AppWindow) => void
/** See the `onDidLoad` function. */
let onDidLoadFns: Array<OnDidLoadFn> | null = []

function uncaughtException(error: Error) {
  error = withSourceMappedStack(error)

  log.error(formatError(error))

  if (hasReportedUncaughtException) {
    return
  }

  hasReportedUncaughtException = true
  preventQuit = true

  setCrashMenu()

  const isLaunchError = !mainWindow

  if (mainWindow) {
    mainWindow.destroy()
    mainWindow = null
  }

  if (sharedProcess) {
    sharedProcess.destroy()
    mainWindow = null
  }

  const crashWindow = new CrashWindow(isLaunchError ? 'launch' : 'generic', error)

  crashWindow.onDidLoad(() => {
    crashWindow.show()
  })

  crashWindow.onFailedToLoad(() => {
    dialog.showMessageBox({
      type: 'error',
      title: __DARWIN__ ? `Unrecoverable Error` : 'Unrecoverable error',
      message:
        `GitHub Desktop has encountered an unrecoverable error and will need to restart.\n\n` +
        `This has been reported to the team, but if you encounter this repeatedly please report ` +
        `this issue to the GitHub Desktop issue tracker.\n\n${error.stack || error.message}`,
    }, (response) => {
      if (!__DEV__) {
        app.relaunch()
      }
      app.quit()
    })
  })

  crashWindow.onClose(() => {
    if (!__DEV__) {
      app.relaunch()
    }
    app.quit()
  })

  crashWindow.load()
}

process.on('uncaughtException', (error: Error) => {
  reportError(error)
  uncaughtException(error)
})

if (__WIN32__ && process.argv.length > 1) {
  if (handleSquirrelEvent(process.argv[1])) {
    app.quit()
  } else {
    const action = parseURL(process.argv[1])
    if (action.name === 'open-repository') {
      onDidLoad(window => {
        window.sendURLAction(action)
      })
    }
  }
}

if (shellNeedsPatching(process)) {
  updateEnvironmentForProcess()
}

const isDuplicateInstance = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }

  // look at the second argument received, it should have the OAuth
  // callback contents and code for us to complete the signin flow
  if (commandLine.length > 1) {
    const action = parseURL(commandLine[1])
    onDidLoad(window => {
      window.sendURLAction(action)
    })
  }
})

if (isDuplicateInstance) {
  app.quit()
}

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault()

    const action = parseURL(url)
    onDidLoad(window => {
      // This manual focus call _shouldn't_ be necessary, but is for Chrome on
      // macOS. See https://github.com/desktop/desktop/issues/973.
      window.focus()
      window.sendURLAction(action)
    })
  })
})

app.on('ready', () => {
  if (isDuplicateInstance) { return }

  readyTime = now() - launchTime

  app.setAsDefaultProtocolClient('x-github-client')
  // Also support Desktop Classic's protocols.
  if (__DARWIN__) {
    app.setAsDefaultProtocolClient('github-mac')
  } else if (__WIN32__) {
    app.setAsDefaultProtocolClient('github-windows')
  }

  sharedProcess = new SharedProcess()
  sharedProcess.register()

  createWindow()

  const menu = buildDefaultMenu(sharedProcess)
  Menu.setApplicationMenu(menu)

  ipcMain.on('menu-event', (event, args) => {
    const { name }: { name: MenuEvent } = event as any
    if (mainWindow) {
      mainWindow.sendMenuEvent(name)
    }
  })

  /**
   * An event sent by the renderer asking that the menu item with the given id
   * is executed (ie clicked).
   */
  ipcMain.on('execute-menu-item', (event: Electron.IpcMainEvent, { id }: { id: string }) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      const window = BrowserWindow.fromWebContents(event.sender)
      const fakeEvent = { preventDefault: () => {}, sender: event.sender }
      menuItem.click(fakeEvent, window, event.sender)
    }
  })

  ipcMain.on('update-menu-state', (event: Electron.IpcMainEvent, items: Array<{ id: string, state: IMenuItemState }>) => {
    let sendMenuChangedEvent = false

    for (const item of items) {
      const { id, state } = item
      const menuItem = findMenuItemByID(menu, id)

      if (menuItem) {
        // Only send the updated app menu when the state actually changes
        // or we might end up introducing a never ending loop between
        // the renderer and the main process
        if (state.enabled !== undefined && menuItem.enabled !== state.enabled) {
          menuItem.enabled = state.enabled
          sendMenuChangedEvent = true
        }
      } else {
        fatalError(`Unknown menu id: ${id}`)
      }
    }

    if (sendMenuChangedEvent && mainWindow) {
      mainWindow.sendAppMenu()
    }
  })

  ipcMain.on('show-contextual-menu', (event: Electron.IpcMainEvent, items: ReadonlyArray<any>) => {
    const menu = new Menu()
    const menuItems = items.map((item, i) => {
      return new MenuItem({
        label: item.label,
        click: () => event.sender.send('contextual-menu-action', i),
        type: item.type,
        enabled: item.enabled,
      })
    })

    for (const item of menuItems) {
      menu.append(item)
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    // TODO: read https://github.com/desktop/desktop/issues/1003
    // to clean up this sin against T Y P E S
    const anyMenu: any = menu
    anyMenu.popup(window, { async: true })
  })

  /**
   * An event sent by the renderer asking for a copy of the current
   * application menu.
   */
  ipcMain.on('get-app-menu', () => {
    if (mainWindow) {
      mainWindow.sendAppMenu()
    }
  })

  ipcMain.on('show-certificate-trust-dialog', (event: Electron.IpcMainEvent, { certificate, message }: { certificate: Electron.Certificate, message: string }) => {
    // This API's only implemented on macOS right now.
    if (__DARWIN__) {
      onDidLoad(window => {
        window.showCertificateTrustDialog(certificate, message)
      })
    }
  })

  ipcMain.on('log', (event: Electron.IpcMainEvent, level: LogLevel, message: string) => {
    writeLog(level, message)
  })

  ipcMain.on('uncaught-exception', (event: Electron.IpcMainEvent, error: Error) => {
    uncaughtException(error)
  })

  ipcMain.on('send-error-report', (event: Electron.IpcMainEvent, { error, extra }: { error: Error, extra: { [key: string]: string } }) => {
    reportError(error, extra)
  })

  autoUpdater.on('error', err => {
    onDidLoad(window => {
      window.sendAutoUpdaterError(err)
    })
  })
})

app.on('activate', () => {
  onDidLoad(window => {
    window.show()
  })
})

app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, url) => {
    // Prevent links or window.open from opening new windows
    event.preventDefault()
    log.warn(`Prevented new window to: ${url}`)
  })
})

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  callback(false)

  onDidLoad(window => {
    window.sendCertificateError(certificate, error, url)
  })
})

function createWindow() {
  const window = new AppWindow()

  if (__DEV__) {
    const installer = require('electron-devtools-installer')
    require('electron-debug')({ showDevTools: true })

    const extensions = [
      'REACT_DEVELOPER_TOOLS',
      'REACT_PERF',
    ]

    for (const name of extensions) {
      try {
        installer.default(installer[name])
      } catch (e) {}
    }
  }

  window.onClose(() => {
    mainWindow = null

    if (!__DARWIN__ && !preventQuit) {
      app.quit()
    }
  })

  window.onDidLoad(() => {
    window.show()
    window.sendLaunchTimingStats({
      mainReadyTime: readyTime!,
      loadTime: window.loadTime!,
      rendererReadyTime: window.rendererReadyTime!,
    })

    const fns = onDidLoadFns!
    onDidLoadFns = null
    for (const fn of fns) {
      fn(window)
    }
  })

  window.load()

  mainWindow = window
}

/**
 * Register a function to be called once the window has been loaded. If the
 * window has already been loaded, the function will be called immediately.
 */
function onDidLoad(fn: OnDidLoadFn) {
  if (onDidLoadFns) {
    onDidLoadFns.push(fn)
  } else {
    if (mainWindow) {
      fn(mainWindow)
    }
  }
}
