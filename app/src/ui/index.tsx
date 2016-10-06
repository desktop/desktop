import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'
import * as Url from 'url'

import { ipcRenderer, remote } from 'electron'

import { App } from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitHubUserStore, GitHubUserDatabase, CloningRepositoriesStore, EmojiStore } from '../lib/dispatcher'
import { URLActionType } from '../lib/parse-url'
import { Repository } from '../models/repository'
import { getDefaultDir } from './lib/default-dir'
import { SelectionType } from '../lib/app-state'
import { sendReady } from './main-process-proxy'
import { reportError } from '../lib/exception-reporting'
import * as appProxy from './lib/app-proxy'
import { shouldReportStats, reportStats, ILaunchTimingStats } from './stats-reporting'

const startTime = Date.now()

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

process.on('uncaughtException', (error: Error) => {
  reportError(error, appProxy.getVersion())
})

const gitHubUserStore = new GitHubUserStore(new GitHubUserDatabase('GitHubUserDatabase'))
const cloningRepositoriesStore = new CloningRepositoriesStore()
const emojiStore = new EmojiStore()
const appStore = new AppStore(gitHubUserStore, cloningRepositoriesStore, emojiStore)
const dispatcher = new Dispatcher(appStore)
dispatcher.loadInitialState().then(() => {
  const now = Date.now()
  sendReady(now - startTime)
})

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

ipcRenderer.on('launch-timing-stats', (event: Electron.IpcRendererEvent, { stats }: { stats: ILaunchTimingStats }) => {
  console.info(`App ready time: ${stats.mainReadyTime}ms`)
  console.info(`Load time: ${stats.loadTime}ms`)
  console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

  if (shouldReportStats() || false) {
    reportStats({
      launchTimingStats: stats,
      version: appProxy.getVersion(),
    })
  }
})

function openRepository(url: string) {
  const state = appStore.getState()
  const repositories = state.repositories
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
    const lastCloneLocationConfigKey = 'last-clone-location'
    const cloneLocation = localStorage.getItem(lastCloneLocationConfigKey) || getDefaultDir()

    const defaultName = Path.basename(Url.parse(url)!.path!, '.git')
    const path: string | null = remote.dialog.showSaveDialog({
      buttonLabel: 'Clone',
      defaultPath: Path.join(cloneLocation, defaultName),
    })
    if (!path) { return }

    localStorage.setItem(lastCloneLocationConfigKey, Path.resolve(path, '..'))

    // TODO: This isn't quite right. We should probably get the user from the
    // context or URL or something.
    const user = state.users[0]
    return dispatcher.clone(url, path, user)
  }
}

ReactDOM.render(
  <App dispatcher={dispatcher} appStore={appStore}/>,
  document.getElementById('desktop-app-container')!
)
