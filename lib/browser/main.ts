import {app} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import TrayIcon from './tray'
const stats = new Stats()

let mainWindow: AppWindow = null
let trayIcon = new TrayIcon()

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('ready', () => {
  stats.readyTime = Date.now()

  mainWindow = new AppWindow(stats)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.load()
  trayIcon.load()
})
