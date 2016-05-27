import {app, ipcMain, Menu} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {authenticate} from '../auth'
import {buildDefaultMenu} from './menu'
import parseURL from './parse-url'

const stats = new Stats()

let mainWindow: AppWindow = null

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    const action = parseURL(url)
    mainWindow.sendURLAction(action)
    event.preventDefault()
  })
})

app.on('ready', () => {
  stats.readyTime = Date.now()

  app.setAsDefaultProtocolClient('x-github-client')
  ipcMain.on('request-auth', authenticate)

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
