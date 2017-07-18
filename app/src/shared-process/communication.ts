import { remote, ipcRenderer } from 'electron'
import { IMessage } from './message'
import { AccountsStore } from './accounts-store'
import { RepositoriesStore } from './repositories-store'

const { BrowserWindow } = remote

type SharedProcessFunction = (args: any) => Promise<any>
const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

/**
 * Dispatch the received message to the appropriate function and respond with
 * the return value.
 */
function dispatch(message: IMessage) {
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
  promise
    .then(result => ({ result, type: 'result' }))
    .catch((error: Error) => {
      const errorInfo = {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
      return { error: errorInfo, type: 'error' }
    })
    .then(response => {
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send(`shared/response/${guid}`, [ response ])
      })
    })
}

/** Register a function to respond to requests with the given name. */
export function register(name: string, fn: SharedProcessFunction) {
  registeredFunctions[name] = fn
}

/** Tell all the windows that something was updated. */
export function broadcastUpdate(accountsStore: AccountsStore, repositoriesStore: RepositoriesStore) {
  BrowserWindow.getAllWindows().forEach(async (window) => {
    const repositories = await repositoriesStore.getRepositories()
    const accounts = await accountsStore.getAll()
    const state = { accounts, repositories }
    window.webContents.send('shared/did-update', [ { state } ])
  })
}

ipcRenderer.on('shared/request', (event, args) => {
  dispatch(args[0])
})
