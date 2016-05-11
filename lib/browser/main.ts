import {app} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'

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
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.load()
})
