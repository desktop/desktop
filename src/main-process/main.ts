import {app, ipcMain, Menu} from 'electron'

import AppWindow from './app-window'
import Stats from './stats'
import {requestToken, authenticate, setToken} from '../auth'
import {buildDefaultMenu} from './menu'
import {OAuthAction} from './parse-url'
import parseURL from './parse-url'

const stats = new Stats()

let mainWindow: AppWindow = null

app.on('will-finish-launching', () => {
  app.on('open-url', (event, url) => {
    handleURL(url)
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

function handleURL(url: string) {
  const action = parseURL(url)
  if (action.type === 'oauth') {
    // Ideally TypeScript would do type refinement so we didn't have to do this
    // cast :\
    const oAuthAction = action as OAuthAction
    requestToken(oAuthAction.code).then(token => {
      setToken(token)
      mainWindow.didAuthenticate()
    })
  } else {
    console.error(`I dunno how to handle this URL: ${url}`)
  }
}
