import * as URL from 'url'
import {app, ipcMain, Menu} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {requestToken, authenticate, setToken} from '../auth'
import {buildDefaultMenu} from './menu'

const stats = new Stats()

let mainWindow: AppWindow = null

type URLAction = 'oauth' | 'unknown'

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    const parsedURL = URL.parse(url, true)
    const action = parseURLAction(parsedURL)
    if (action === 'oauth') {
      requestToken(parsedURL.query.code).then(token => {
        setToken(token)
        mainWindow.didAuthenticate()
      })
    } else {
      console.error(`I dunno how to handle this URL: ${url}`)
    }

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

function parseURLAction(parsedURL: URL.Url): URLAction {
  const actionName = parsedURL.hostname
  if (actionName === 'oauth') {
    return 'oauth'
  } else {
    return 'unknown'
  }
}
