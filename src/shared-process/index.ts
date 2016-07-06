import {ipcRenderer, remote} from 'electron'
import {Message} from './message'
import tokenStore from './token-store'
import UsersStore from './users-store'
import {requestToken, askUserToAuth, getDotComEndpoint} from './auth'
import User from '../models/user'
import {URLActionType, isOAuthAction} from '../lib/parse-url'
import Database from './database'
import RepositoriesStore from './repositories-store'
import Repository, {IRepository} from '../models/repository'

const {BrowserWindow} = remote

const Octokat = require('octokat')

type SharedProcessFunction = (args: any) => Promise<any>
const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

const usersStore = new UsersStore(localStorage, tokenStore)
usersStore.loadFromStore()

const database = new Database('Database')
const repositoriesStore = new RepositoriesStore(database)

register('console.log', ({args}: {args: any[]}) => {
  console.log(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('console.error', ({args}: {args: any[]}) => {
  console.error(args[0], ...args.slice(1))
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
})

register('get-users', () => {
  return Promise.resolve(usersStore.getUsers())
})

register('add-repositories', async ({repositories}: {repositories: IRepository[]}) => {
  const inflatedRepositories = repositories.map(r => Repository.fromJSON(r))
  for (const repo of inflatedRepositories) {
    await repositoriesStore.addRepository(repo)
  }

  broadcastUpdate()
})

register('get-repositories', () => {
  return repositoriesStore.getRepositories()
})

register('url-action', async ({action}: {action: URLActionType}) => {
  if (isOAuthAction(action)) {
    await addUserWithCode(action.args.code)
    broadcastUpdate()
  }
})

register('request-oauth', () => {
  askUserToAuth(getDotComEndpoint())
  return Promise.resolve()
})

ipcRenderer.on('shared/request', (event, args) => {
  dispatch(args[0])
})

/**
 * Dispatch the received message to the appropriate function and respond with
 * the return value.
 */
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

/** Register a function to respond to requests with the given name. */
function register(name: string, fn: SharedProcessFunction) {
  registeredFunctions[name] = fn
}

/** Tell all the windows that something was updated. */
function broadcastUpdate() {
  BrowserWindow.getAllWindows().forEach(async (window) => {
    const repositories = await repositoriesStore.getRepositories()
    const state = {users: usersStore.getUsers(), repositories}
    window.webContents.send('shared/did-update', [{state}])
  })
}

/** Request a token, given an OAuth code, and add the user. */
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
