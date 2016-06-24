import {ipcRenderer, remote} from 'electron'

const {BrowserWindow} = remote

const registeredFunctions: {[key: string]: SharedProcessFunction} = {}

register('log', args => {
  console.log(args)

  return Promise.resolve('yes')
})

type SharedProcessFunction = (args: any) => Promise<any>

ipcRenderer.on('shared/request', (event, args) => {
  dispatch(args[0])

  console.log(event)
  console.log(args)
})

function dispatch(event: any) {
  const name = event.name
  const guid = event.guid
  const args = event.args
  const fn = registeredFunctions[name]
  if (!fn) {
    console.error(`Unregistered event sent: ${event}`)
    return
  }

  const promise = fn(args)
  promise.then(x => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send(`shared/response/${guid}`, [x])
    })
  })
}

function register(name: string, fn: SharedProcessFunction) {
  registeredFunctions[name] = fn
}
