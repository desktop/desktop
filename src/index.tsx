import * as React from 'react'
import * as ReactDOM from 'react-dom'

import {ipcRenderer, remote} from 'electron'

import App from './app'
import {requestToken, getDotComEndpoint} from './auth'
import {URLActionType, isOAuthAction} from './lib/parse-url'
import {WindowState, getWindowState} from './lib/window-state'
import UsersStore from './users-store'
import User from './user'
import tokenStore from './token-store'
import {IPCLogEntry} from './lib/ipc-log-entry'

const Octokat = require('octokat')

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../styles/desktop.scss')
}

ipcRenderer.on('log', (event: any, {msg, type}: IPCLogEntry) => {
  switch (type) {
    case 'log':
      console.log(msg)
      break
    case 'error':
      console.error(msg)
      break
  }
})

ipcRenderer.on('url-action', (event, msg) => {
  const action = msg as URLActionType
  if (isOAuthAction(action)) {
    addUserWithCode(action.args.code)
  }
})

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

document.body.classList.add(`platform-${process.platform}`)

function updateFullScreenBodyInfo(windowState: WindowState) {
  if (windowState === 'full-screen') {
    document.body.classList.add('fullscreen')
  } else {
    document.body.classList.remove('fullscreen')
  }
}

updateFullScreenBodyInfo(getWindowState(remote.getCurrentWindow()))
ipcRenderer.on('window-state-changed', (_, args) => updateFullScreenBodyInfo(args as WindowState))

ReactDOM.render(<App usersStore={usersStore}/>, document.getElementById('desktop-app-container'))

async function addUserWithCode(code: string) {
  try {
    const token = await requestToken(code)
    const octo = new Octokat({token})
    const user = await octo.user.fetch()
    usersStore.addUser(new User(user.login, getDotComEndpoint(), token))
  } catch (e) {
    console.error(`Error adding user: ${e}`)
  }
}
