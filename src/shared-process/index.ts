import {ipcRenderer, remote} from 'electron'
import {Message} from './message'

const {BrowserWindow} = remote

type SharedProcessFunction = (args: any) => Promise<any>
const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

register('console/log', ({args}: {args: any[]}) => {
  console.log('', ...args)
  return Promise.resolve()
})

register('console/error', ({args}: {args: any[]}) => {
  console.error('', ...args)
  return Promise.resolve()
})

register('ping', () => {
  return Promise.resolve('pong')
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
