import * as React from 'react'
import * as ReactDOM from 'react-dom'

import {ipcRenderer} from 'electron'

import App from './app'

ipcRenderer.on('log', (event, msg) => {
  console.log(msg)
})

const style = {
  paddingTop: process.platform === 'darwin' ? 20 : 0
}

ReactDOM.render(<App style={style}/>, document.getElementById('content'))
