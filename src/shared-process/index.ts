import {ipcRenderer, remote} from 'electron'
import {Message} from './message'
import tokenStore from './token-store'
import UsersStore from './users-store'
import {requestToken, getDotComEndpoint} from '../auth'
import User from '../user'
import {URLActionType, isOAuthAction} from '../lib/parse-url'

const {BrowserWindow} = remote

const Octokat = require('octokat')

type SharedProcessFunction = (args: any) => Promise<any>
const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

register('console.log', ({args}: {args: any[]}) => {
  console.log('', ...args)
  return Promise.resolve()
})

register('console.error', ({args}: {args: any[]}) => {
  console.error('', ...args)
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
})

register('add-user', () => {
  broadcastUpdate()
  return Promise.resolve()
})

register('get-users', () => {
  const usersJson = JSON.stringify(usersStore.getUsers())
  return Promise.resolve(usersJson)
})

register('url-action', async ({action}: {action: URLActionType}) => {
  if (isOAuthAction(action)) {
    await addUserWithCode(action.args.code)
  }
})

ipcRenderer.on('shared/request', (event, args) => {
  dispatch(args[0])
})

function dispatch(message: Message) {
  const name = message.name
  if (!name) {
    console.error('Unnamed message sent to shared process:')
    console.error(message)
    return
  }

  const fn = registeredFunctions[name]
  if (!fn) {
    console.error('No handler found for message:')
    console.error(message)
    return
  }

  const guid = message.guid
  const args = message.args
  const promise = fn(args)
  promise.then(result => {
    BrowserWindow.getAllWindows().forEach(window => {
      window.webContents.send(`shared/response/${guid}`, [result])
    })
  })
}

function register(name: string, fn: SharedProcessFunction) {
  registeredFunctions[name] = fn
}

function broadcastUpdate() {
  BrowserWindow.getAllWindows().forEach(window => {
    const state = JSON.stringify({users: usersStore.getUsers(), repositories: []})
    window.webContents.send('shared/did-update', [{state}])
  })
}

async function addUserWithCode(code: string) {
  try {
    const token = await requestToken(code)
    const octo = new Octokat({token})
    const user = await octo.user.fetch()
    usersStore.addUser(new User(user.login, getDotComEndpoint(), token))

    broadcastUpdate()
  } catch (e) {
    console.error(`Error adding user: ${e}`)
  }
}
