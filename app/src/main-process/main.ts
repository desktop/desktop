import { app, Menu, autoUpdater, ipcMain } from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import { buildDefaultMenu, MenuEvent, findMenuItemByID } from './menu'
import parseURL from '../lib/parse-url'
import { handleSquirrelEvent, getFeedURL } from './updates'
import SharedProcess from '../shared-process/shared-process'
import fatalError from '../lib/fatal-error'

const stats = new Stats()

let mainWindow: AppWindow | null = null
let sharedProcess: SharedProcess | null = null

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    event.preventDefault()

    const action = parseURL(url)
    getMainWindow().sendURLAction(action)
  })
})

if (process.platform !== 'darwin') {
  if (process.platform === 'win32' && process.argv.length > 1) {
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
}

app.on('ready', () => {
  stats.readyTime = Date.now()

  app.setAsDefaultProtocolClient('x-github-client')
  // Also support Desktop Classic's protocols.
  if (process.platform === 'darwin') {
    app.setAsDefaultProtocolClient('github-mac')
  } else if (process.platform === 'win32') {
    app.setAsDefaultProtocolClient('github-windows')
  }

  sharedProcess = new SharedProcess()
  sharedProcess.register()

  createWindow()

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
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

function createWindow() {
  const window = new AppWindow(stats, sharedProcess!)
  window.onClose(() => {
    mainWindow = null

    if (process.platform !== 'darwin') {
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
