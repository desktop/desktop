import {remote} from 'electron'
import {Message} from './message'
import UsersStore from './users-store'
import RepositoriesStore from './repositories-store'

const {BrowserWindow} = remote

type SharedProcessFunction = (args: any) => Promise<any>
const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

/**
 * Dispatch the received message to the appropriate function and respond with
 * the return value.
 */
export function dispatch(message: Message) {
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
export function register(name: string, fn: SharedProcessFunction) {
  registeredFunctions[name] = fn
}

/** Tell all the windows that something was updated. */
export function broadcastUpdate(usersStore: UsersStore, repositoriesStore: RepositoriesStore) {
  BrowserWindow.getAllWindows().forEach(async (window) => {
    const repositories = await repositoriesStore.getRepositories()
    const state = {users: usersStore.getUsers(), repositories}
    window.webContents.send('shared/did-update', [{state}])
  })
}
