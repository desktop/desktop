import { app, Menu, MenuItem, ipcMain, BrowserWindow, autoUpdater } from 'electron'

import { AppWindow } from './app-window'
import { buildDefaultMenu, MenuEvent, findMenuItemByID } from './menu'
import { parseURL } from '../lib/parse-url'
import { handleSquirrelEvent } from './squirrel-updater'
import { SharedProcess } from '../shared-process/shared-process'
import { fatalError } from '../lib/fatal-error'

import { showFallbackPage } from './error-page'
import { IMenuItemState } from '../lib/menu-update'
import { ILogEntry, logError, log } from '../lib/logging/main'

let mainWindow: AppWindow | null = null
let sharedProcess: SharedProcess | null = null

const launchTime = Date.now()

let readyTime: number | null = null

type OnDidLoadFn = (window: AppWindow) => void
/** See the `onDidLoad` function. */
let onDidLoadFns: Array<OnDidLoadFn> | null = []

process.on('uncaughtException', (error: Error) => {

  logError('Uncaught exception on main process', error)

  if (sharedProcess) {
    sharedProcess.console.error('Uncaught exception:')
    sharedProcess.console.error(error.name)
    sharedProcess.console.error(error.message)
  }

  if (mainWindow) {
    mainWindow.sendException(error)
  } else {
    showFallbackPage(error)
  }
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

  const now = Date.now()
  readyTime = now - launchTime

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

  ipcMain.on('log', (event: Electron.IpcMainEvent, logEntry: ILogEntry) => {
    log(logEntry)
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
    sharedProcess!.console.log(`Prevented new window to: ${url}`)
  })
})

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  callback(false)

  onDidLoad(window => {
    window.sendCertificateError(certificate, error, url)
  })
})

function createWindow() {
  const window = new AppWindow(sharedProcess!)

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

    if (!__DARWIN__) {
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
