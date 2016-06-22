import * as React from 'react'
import * as ReactDOM from 'react-dom'

import {ipcRenderer, remote} from 'electron'

import App from './app'
import {requestToken, getDotComEndpoint} from './auth'
import {URLActionType, isOAuthAction} from './lib/parse-url'
import UsersStore from './users-store'
import User from './user'
import tokenStore from './token-store'

const Octokat = require('octokat')

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../styles/desktop.scss')
}

ipcRenderer.on('log', (event, msg) => {
  console.log(msg)
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

function updateFullScreenBodyInfo(isInFullScreen: boolean) {
  if (isInFullScreen) {
    document.body.classList.add('fullscreen')
  } else {
    document.body.classList.remove('fullscreen')
  }
}

updateFullScreenBodyInfo(remote.getCurrentWindow().isFullScreen())

ipcRenderer.on('enter-full-screen', () => updateFullScreenBodyInfo(true))
ipcRenderer.on('leave-full-screen', () => updateFullScreenBodyInfo(false))

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
