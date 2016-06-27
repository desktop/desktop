import {app, Menu, autoUpdater} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {buildDefaultMenu} from './menu'
import parseURL from '../lib/parse-url'
import {handleSquirrelEvent, getFeedURL} from './updates'
import SharedProcess from '../shared-process/shared-process'

const stats = new Stats()

let mainWindow: AppWindow = null
let sharedProcess: SharedProcess = null

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    const action = parseURL(url)
    // TODO: We need to handle the case where the window's been closed.
    mainWindow.sendURLAction(action)
    event.preventDefault()
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
      // TODO: We need to handle the case where the window's been closed.
      mainWindow.sendURLAction(action)
    }
  })

  if (shouldQuit) {
    app.quit()
  }
}

app.on('ready', () => {
  stats.readyTime = Date.now()

  app.setAsDefaultProtocolClient('x-github-client')

  createWindow()

  sharedProcess = new SharedProcess()
  sharedProcess.register()

  Menu.setApplicationMenu(buildDefaultMenu())

  autoUpdater.on('error', error => {
    if (mainWindow) {
      mainWindow.console.error(`${error}`)
    }
  })

  autoUpdater.on('update-available', () => {
    if (mainWindow) {
      mainWindow.console.log('Update available!')
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (mainWindow) {
      mainWindow.console.log('Update not available!')
    }
  })

  autoUpdater.on('update-downloaded', (event, releaseNotes, releaseName, releaseDate, updateURL) => {
    if (mainWindow) {
      mainWindow.console.log(`Update downloaded! ${releaseDate}`)
    }
  })

  // TODO: Plumb the logged in .com user through here.
  // Truly we have been haacked.
  autoUpdater.setFeedURL(getFeedURL('haacked'))
  if (process.env.NODE_ENV !== 'development') {
    try {
      autoUpdater.checkForUpdates()
    } catch (e) {
      if (mainWindow) {
        mainWindow.console.error(`Error checking for updates: ${e}`)
      }
    }
  }
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

function createWindow() {
  mainWindow = new AppWindow(stats)
  mainWindow.onClose(() => {
    mainWindow = null
  })

  mainWindow.load()
}
