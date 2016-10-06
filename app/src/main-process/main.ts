import { app, Menu, MenuItem, autoUpdater, ipcMain, BrowserWindow } from 'electron'

import { AppWindow } from './app-window'
import { buildDefaultMenu, MenuEvent, findMenuItemByID } from './menu'
import { parseURL } from '../lib/parse-url'
import { handleSquirrelEvent, getFeedURL } from './updates'
import { SharedProcess } from '../shared-process/shared-process'
import { fatalError } from '../lib/fatal-error'
import { reportError } from '../lib/exception-reporting'

let mainWindow: AppWindow | null = null
let sharedProcess: SharedProcess | null = null

process.on('uncaughtException', (error: Error) => {
  if (sharedProcess) {
    sharedProcess.console.error(error)
  }

  reportError(error, app.getVersion())
})

if (__WIN32__ && process.argv.length > 1) {
  if (handleSquirrelEvent(process.argv[1])) {
    app.quit()
  }
}

const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
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
    getMainWindow().sendURLAction(action)
  }
})

if (shouldQuit) {
  app.quit()
}

app.on('ready', () => {

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

  app.on('open-url', (event, url) => {
    event.preventDefault()

    const action = parseURL(url)
    getMainWindow().sendURLAction(action)
  })

  const menu = buildDefaultMenu(sharedProcess)
  Menu.setApplicationMenu(menu)

  autoUpdater.on('error', error => {
    sharedProcess!.console.error(`${error}`)
  })

  autoUpdater.on('update-available', () => {
    sharedProcess!.console.log('Update available!')
  })

  autoUpdater.on('update-not-available', () => {
    sharedProcess!.console.log('Update not available!')
  })

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
    sharedProcess!.console.log(`Update downloaded! ${releaseDate}`)
  })

  // TODO: Plumb the logged in .com user through here.
  // Truly we have been haacked.
  autoUpdater.setFeedURL(getFeedURL('haacked'))
  if (process.env.NODE_ENV !== 'development') {
    try {
      autoUpdater.checkForUpdates()
    } catch (e) {
      sharedProcess!.console.error(`Error checking for updates: ${e}`)
    }
  }

  ipcMain.on('menu-event', (event, args) => {
    const { name }: { name: MenuEvent } = event as any
    if (mainWindow) {
      mainWindow.sendMenuEvent(name)
    }
  })

  ipcMain.on('set-menu-enabled', (event: Electron.IpcMainEvent, [ { id, enabled } ]: [ { id: string, enabled: boolean } ]) => {
    const menuItem = findMenuItemByID(menu, id)
    if (menuItem) {
      menuItem.enabled = enabled
    } else {
      fatalError(`Unknown menu id: ${id}`)
    }
  })

  ipcMain.on('show-main-window', () => {
    getMainWindow().show()
  })

  ipcMain.on('show-contextual-menu', (event: Electron.IpcMainEvent, items: ReadonlyArray<any>) => {
    const menu = new Menu()
    const menuItems = items.map((item, i) => {
      return new MenuItem({
        label: item.label,
        click: () => event.sender.send('contextual-menu-action', i),
      })
    })

    for (const item of menuItems) {
      menu.append(item)
    }

    const window = BrowserWindow.fromWebContents(event.sender)
    menu.popup(window)
  })
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

function createWindow() {
  const window = new AppWindow(sharedProcess!)
  window.onClose(() => {
    mainWindow = null

    if (!__DARWIN__) {
      app.quit()
    }
  })

  window.load()

  mainWindow = window
}

/** Get the main window, creating it if necessary. */
function getMainWindow(): AppWindow {
  if (!mainWindow) {
    createWindow()
  }

  return mainWindow!
}
