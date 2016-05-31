import {app, Menu} from 'electron'

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

const shouldQuit = app.makeSingleInstance((commandLine, workingDirectory) => {
  // Someone tried to run a second instance, we should focus our window.
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.focus()
  }

  if (commandLine.length > 1) {
    const action = parseURL(commandLine[1])
    mainWindow.sendURLAction(action)
  }
});

if (shouldQuit) {
  app.quit()
}

app.on('ready', () => {
  stats.readyTime = Date.now()

  app.setAsDefaultProtocolClient('x-github-client')

  createWindow()

  Menu.setApplicationMenu(buildDefaultMenu())
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
