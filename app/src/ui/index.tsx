import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { ipcRenderer, remote } from 'electron'

import App from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, LocalStore } from '../lib/dispatcher'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

const store = new LocalStore()
const dispatcher = new Dispatcher(store)
dispatcher.loadInitialState()

document.body.classList.add(`platform-${process.platform}`)

function updateFullScreenBodyInfo(windowState: WindowState) {
  if (windowState === 'full-screen') {
    document.body.classList.add('fullscreen')
  } else {
    document.body.classList.remove('fullscreen')
  }
}

updateFullScreenBodyInfo(getWindowState(remote.getCurrentWindow()))
ipcRenderer.on('window-state-changed', (_, args) => updateFullScreenBodyInfo(args as WindowState))

ReactDOM.render(<App dispatcher={dispatcher} store={store}/>, document.getElementById('desktop-app-container')!)
