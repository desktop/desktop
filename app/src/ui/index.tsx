import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'
import * as Url from 'url'

import { ipcRenderer, remote, shell } from 'electron'

import { App } from './app'
import { WindowState, getWindowState } from '../lib/window-state'
import { Dispatcher, AppStore, GitHubUserStore, GitHubUserDatabase, CloningRepositoriesStore, EmojiStore } from '../lib/dispatcher'
import { URLActionType, IOpenRepositoryArgs } from '../lib/parse-url'
import { Repository } from '../models/repository'
import { getDefaultDir, setDefaultDir } from './lib/default-dir'
import { SelectionType } from '../lib/app-state'
import { sendReady } from './main-process-proxy'
import { reportError } from '../lib/exception-reporting'
import { getVersion } from './lib/app-proxy'
import { StatsDatabase, StatsStore } from '../lib/stats'
import { IssuesDatabase, IssuesStore, SignInStore } from '../lib/dispatcher'
import { requestAuthenticatedUser, resolveOAuthRequest, rejectOAuthRequest } from '../lib/oauth'
import { defaultErrorHandler, createMissingRepositoryHandler } from '../lib/dispatcher'
import { getEndpointForRepository, getUserForEndpoint } from '../lib/api'
import { getLogger } from '../lib/logging/renderer'
import { installDevGlobals } from './install-globals'

if (__DEV__) {
  installDevGlobals()
}

const startTime = Date.now()

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
  * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

process.on('uncaughtException', (error: Error) => {
  getLogger().error('Uncaught exception on UI', error)
  reportError(error, getVersion())
})

const gitHubUserStore = new GitHubUserStore(new GitHubUserDatabase('GitHubUserDatabase'))
const cloningRepositoriesStore = new CloningRepositoriesStore()
const emojiStore = new EmojiStore()
const issuesStore = new IssuesStore(new IssuesDatabase('IssuesDatabase'))
const statsStore = new StatsStore(new StatsDatabase('StatsDatabase'))
const signInStore = new SignInStore()

const appStore = new AppStore(
  gitHubUserStore,
  cloningRepositoriesStore,
  emojiStore,
  issuesStore,
  statsStore,
  signInStore,
)

const dispatcher = new Dispatcher(appStore)
dispatcher.registerErrorHandler(defaultErrorHandler)
dispatcher.registerErrorHandler(createMissingRepositoryHandler(appStore))

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
  if (!state || state.type !== SelectionType.Repository) { return }

  dispatcher.refreshRepository(state.repository)
})

ipcRenderer.on('blur', () => {
  // Make sure we stop highlighting the menu button (on non-macOS)
  // when someone uses Alt+Tab to switch application since we won't
  // get the onKeyUp event for the Alt key in that case.
  dispatcher.setAppMenuToolbarButtonHighlightState(false)
})

ipcRenderer.on('url-action', async (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
  switch (action.name) {
    case 'oauth':
      try {
        const user = await requestAuthenticatedUser(action.args.code)
        if (user) {
          resolveOAuthRequest(user)
        } else {
          rejectOAuthRequest(new Error('Unable to fetch authenticated user.'))
        }
      } catch (e) {
        rejectOAuthRequest(e)
      }
      break

    case 'open-repository':
      const { pr, url, branch } = action.args

      // a forked PR will set both of these values, despite the branch not existing
      // in the repository - handle this and avoid cloning it
      const branchToClone = (pr && branch) ? undefined : branch

      openRepository(url, branchToClone)
        .then(repository => handleCloneInDesktopOptions(repository, action.args))
      break

    default:
      console.log(`Unknown URL action: ${action.name} - payload: ${JSON.stringify(action)}`)
  }
})

function cloneRepository(url: string, branch?: string): Promise<Repository | null> {
  const cloneLocation = getDefaultDir()

  const defaultName = Path.basename(Url.parse(url)!.path!, '.git')
  const path: string | null = remote.dialog.showSaveDialog({
    buttonLabel: 'Clone',
    defaultPath: Path.join(cloneLocation, defaultName),
  })
  if (!path) { return Promise.resolve(null) }

  setDefaultDir(Path.resolve(path, '..'))

  const state = appStore.getState()

  const endpoint = getEndpointForRepository(url)

  const userForRepository = getUserForEndpoint(state.users, endpoint) || null

  return dispatcher.clone(url, path, { user: userForRepository, branch })
}

async function handleCloneInDesktopOptions(repository: Repository | null, args: IOpenRepositoryArgs): Promise<void> {
  // skip this if the clone failed for whatever reason
  if (!repository) { return }

  const { filepath, pr, branch } = args

  // we need to refetch for a forked PR and check that out
  if (pr && branch) {
    const fetchspec = `pull/${pr}/head:${branch}`

    await dispatcher.fetch(repository, fetchspec)
    await dispatcher.checkoutBranch(repository, branch)
  }

  if (filepath) {
    const fullPath = Path.join(repository.path, filepath)
    // because Windows uses different path separators here
    const normalized = Path.normalize(fullPath)
    shell.openItem(normalized)
  }
}

function openRepository(url: string, branch?: string): Promise<Repository | null> {
  const state = appStore.getState()
  const repositories = state.repositories
  const existingRepository = repositories.find(r => {
    if (r instanceof Repository) {
      const gitHubRepository = r.gitHubRepository
      if (!gitHubRepository) { return false }
      return gitHubRepository.cloneURL === url
    } else {
      return false
    }
  })

  if (existingRepository) {
    return dispatcher.selectRepository(existingRepository).then(r => {
      if (!r || !branch) { return r }
      return dispatcher.checkoutBranch(r, branch)
    })
  }

  return cloneRepository(url, branch)
}

ReactDOM.render(
  <App dispatcher={dispatcher} appStore={appStore}/>,
  document.getElementById('desktop-app-container')!
)
