import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { ipcRenderer, remote } from 'electron'

import App from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitUserStore, GitUserDatabase, CloningRepositoriesStore } from '../lib/dispatcher'
import { URLActionType } from '../lib/parse-url'
import Repository from '../models/repository'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

const appStore = new AppStore()
const gitUserStore = new GitUserStore(new GitUserDatabase('GitUserDatabase'))
const cloningRepositoriesStore = new CloningRepositoriesStore()
const dispatcher = new Dispatcher(appStore, gitUserStore, cloningRepositoriesStore)
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
  const repository = appStore.getState().selectedRepository
  if (!repository || !(repository instanceof Repository)) { return }

  dispatcher.refreshRepository(repository)
})

ipcRenderer.on('url-action', (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
  dispatcher.handleURLAction(action)
})

ReactDOM.render(
  <App dispatcher={dispatcher} appStore={appStore} gitUserStore={gitUserStore} cloningRepositoriesStore={cloningRepositoriesStore}/>, document.getElementById('desktop-app-container')!)
