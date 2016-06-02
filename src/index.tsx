import * as React from 'react'
import * as ReactDOM from 'react-dom'

import {ipcRenderer} from 'electron'

import App from './app'
import {requestToken, getDotComEndpoint} from './auth'
import {URLActionType, isOAuthAction} from './lib/parse-url'
import UsersStore from './users-store'
import User from './user'
import tokenStore from './token-store'

const Octokat = require('octokat')

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

ReactDOM.render(<App usersStore={usersStore}/>, document.getElementById('content'))

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
