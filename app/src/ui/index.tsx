import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { ipcRenderer, remote } from 'electron'

import App from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitUserStore, GitUserDatabase } from '../lib/dispatcher'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

const store = new AppStore()
const gitUserStore = new GitUserStore(new GitUserDatabase('GitUserDatabase'))
const dispatcher = new Dispatcher(store, gitUserStore)
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

ipcRenderer.on('focus', () => {
  const repository = store.getState().selectedRepository
  if (!repository) { return }

  dispatcher.refreshRepository(repository)
})

ReactDOM.render(<App dispatcher={dispatcher} store={store} gitUserStore={gitUserStore}/>, document.getElementById('desktop-app-container')!)
