import {ipcRenderer} from 'electron'

ipcRenderer.on('background-command', (event, args) => {
  handleEvent(args[0])

  console.log(event)
  console.log(args)
})

function handleEvent(event: any) {
  const name = event.name
  const guid = event.guid
  // const args = event.args
  ipcRenderer.send(`response-${guid}`, [name])
}
