import * as React from 'react'
import * as ReactDOM from 'react-dom'

import {ipcRenderer} from 'electron'

import App from './app'
import {requestToken, getDotComEndpoint} from './auth'
import {URLActionType, OAuthAction} from './lib/parse-url'
import UsersStore from './users-store'
import User from './user'

const Octokat = require('octokat')

ipcRenderer.on('log', (event, msg) => {
  console.log(msg)
})

ipcRenderer.on('url-action', (event, msg) => {
  const action = msg as URLActionType
  if (action.name === 'oauth') {
    const oAuthAction = action as OAuthAction
    addUserWithCode(oAuthAction.args.code)
  }
})

const style = {
  paddingTop: process.platform === 'darwin' ? 20 : 0
}

const usersStore = new UsersStore()
usersStore.loadFromDisk()

ReactDOM.render(<App style={style} usersStore={usersStore}/>, document.getElementById('content'))

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
