import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'
import * as Url from 'url'

import { ipcRenderer, remote } from 'electron'

import App from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitUserStore, GitUserDatabase } from '../lib/dispatcher'
import { URLActionType } from '../lib/parse-url'
import Repository from '../models/repository'
import { getDefaultDir } from './lib/default-dir'
import { SelectionType } from '../lib/app-state'

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
  const state = appStore.getState().selectedState
  if (!state || state.type === SelectionType.CloningRepository) { return }

  dispatcher.refreshRepository(state.repository)
})

ipcRenderer.on('url-action', async (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
  const handled = await dispatcher.handleURLAction(action)
  if (handled) { return }

  if (action.name === 'open-repository') {
    openRepository(action.args)
  }
})

function openRepository(url: string) {
  const repositories = appStore.getState().repositories
  const existingRepository = repositories.find(r => {
    if (r instanceof Repository) {
      const gitHubRepository = r.gitHubRepository
      if (!gitHubRepository) { return false }
      return gitHubRepository.htmlURL === url
    } else {
      return false
    }
  })

  if (existingRepository) {
    return dispatcher.selectRepository(existingRepository)
  } else {
    const defaultName = Path.basename(Url.parse(url)!.path!, '.git')
    const path: string | null = remote.dialog.showSaveDialog({
      buttonLabel: 'Clone',
      defaultPath: Path.join(getDefaultDir(), defaultName),
    })
    if (!path) { return }

    return dispatcher.clone(url, path)
  }
}

ReactDOM.render(
  <App dispatcher={dispatcher} appStore={appStore} gitUserStore={gitUserStore}/>,
  document.getElementById('desktop-app-container')!
)
