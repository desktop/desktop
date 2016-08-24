import * as React from 'react'
import * as ReactDOM from 'react-dom'

import { ipcRenderer, remote } from 'electron'

import App from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitUserStore, GitUserDatabase } from '../lib/dispatcher'
import { URLActionType } from '../lib/parse-url'

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

const appStore = new AppStore()
const gitUserStore = new GitUserStore(new GitUserDatabase('GitUserDatabase'))
const dispatcher = new Dispatcher(appStore, gitUserStore)
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
  if (!repository) { return }

  dispatcher.refreshRepository(repository)
})

ipcRenderer.on('url-action', async (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
  const handled = await dispatcher.handleURLAction(action)
  if (handled) { return }


})

ReactDOM.render(<App dispatcher={dispatcher} appStore={appStore} gitUserStore={gitUserStore}/>, document.getElementById('desktop-app-container')!)
