import {app, Menu} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {buildDefaultMenu} from './menu'

const stats = new Stats()

let mainWindow: AppWindow = null

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('ready', () => {
  stats.readyTime = Date.now()

  mainWindow = new AppWindow(stats)
  mainWindow.onClose(() => {
    mainWindow = null
  })

  mainWindow.load()
}

app.on('ready', () => {
  stats.readyTime = Date.now()

  createWindow()

  Menu.setApplicationMenu(buildDefaultMenu())
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (!mainWindow) {
    createWindow()
  }
})
