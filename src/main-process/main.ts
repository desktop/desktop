import {app, Menu, autoUpdater} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {buildDefaultMenu} from './menu'
import parseURL from '../lib/parse-url'

const stats = new Stats()

let mainWindow: AppWindow = null

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    const action = parseURL(url)
    mainWindow.sendURLAction(action)
    event.preventDefault()
  })
})

if (process.platform !== 'darwin') {
  if (process.platform === 'win32') {
    if (handleSquirrelEvent()) {
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

  Menu.setApplicationMenu(buildDefaultMenu())

  autoUpdater.on('error', error => {
    mainWindow.console.error(`${error}`)
  })
  autoUpdater.on('update-available', () => {
    mainWindow.console.log('Update available!')
  })
  autoUpdater.on('update-not-available', () => {
    mainWindow.console.log('Update not available!')
  })
  autoUpdater.on('update-downloaded', info => {
    mainWindow.console.log(`Update downloaded! ${info}`)
  })
  autoUpdater.setFeedURL('https://central.github.com/api/deployments/desktop/desktop/latest')
  autoUpdater.checkForUpdates()
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

function handleSquirrelEvent() {
  if (process.argv.length === 1) {
    return false
  }

  const squirrelEvent = process.argv[1]
  switch (squirrelEvent) {
    case '--squirrel-install':
    case '--squirrel-updated':
      // Optionally do things such as:
      // - Add your .exe to the PATH
      // - Write to the registry for things like file associations and
      //   explorer context menus

      // Install desktop and start menu shortcuts
      return true

    case '--squirrel-uninstall':
      // Undo anything you did in the --squirrel-install and
      // --squirrel-updated handlers

      // Remove desktop and start menu shortcuts
      return true

    case '--squirrel-obsolete':
      // This is called on the outgoing version of your app before
      // we update to the new version - it's the opposite of
      // --squirrel-updated
      return true
  }

  return false
}
