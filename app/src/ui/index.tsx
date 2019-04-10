import '../lib/logging/renderer/install'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'

import { ipcRenderer, remote } from 'electron'

import { App } from './app'
import {
  Dispatcher,
  gitAuthenticationErrorHandler,
  externalEditorErrorHandler,
  openShellErrorHandler,
  mergeConflictHandler,
  lfsAttributeMismatchHandler,
  defaultErrorHandler,
  missingRepositoryHandler,
  backgroundTaskHandler,
  pushNeedsPullHandler,
  upstreamAlreadyExistsHandler,
  rebaseConflictsHandler,
} from './dispatcher'
import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  IssuesStore,
  SignInStore,
  RepositoriesStore,
  TokenStore,
  AccountsStore,
  PullRequestStore,
} from '../lib/stores'
import { GitHubUserDatabase } from '../lib/databases'
import { URLActionType } from '../lib/parse-app-url'
import { SelectionType } from '../lib/app-state'
import { StatsDatabase, StatsStore } from '../lib/stats'
import {
  IssuesDatabase,
  RepositoriesDatabase,
  PullRequestDatabase,
} from '../lib/databases'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { installDevGlobals } from './install-globals'
import { reportUncaughtException, sendErrorReport } from './main-process-proxy'
import { getOS } from '../lib/get-os'
import { getGUID } from '../lib/stats'
import {
  enableSourceMaps,
  withSourceMappedStack,
} from '../lib/source-map-support'
import { UiActivityMonitor } from './lib/ui-activity-monitor'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { ApiRepositoriesStore } from '../lib/stores/api-repositories-store'
import { enablePullWithRebase } from '../lib/feature-flag'
import { CommitStatusStore } from '../lib/stores/commit-status-store'

if (__DEV__) {
  installDevGlobals()
}

if (shellNeedsPatching(process)) {
  updateEnvironmentForProcess()
}

enableSourceMaps()

// Tell dugite where to find the git environment,
// see https://github.com/desktop/dugite/pull/85
process.env['LOCAL_GIT_DIRECTORY'] = Path.resolve(__dirname, 'git')

// We're using a polyfill for the upcoming CSS4 `:focus-ring` pseudo-selector.
// This allows us to not have to override default accessibility driven focus
// styles for buttons in the case when a user clicks on a button. This also
// gives better visiblity to individuals who navigate with the keyboard.
//
// See:
//   https://github.com/WICG/focus-ring
//   Focus Ring! -- A11ycasts #16: https://youtu.be/ilj2P5-5CjI
require('wicg-focus-ring')

const startTime = performance.now()

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
   * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

process.once('uncaughtException', (error: Error) => {
  error = withSourceMappedStack(error)

  console.error('Uncaught exception', error)

  if (__DEV__ || process.env.TEST_ENV) {
    console.error(
      `An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`
    )
  } else {
    sendErrorReport(error, {
      osVersion: getOS(),
      guid: getGUID(),
    })
  }

  reportUncaughtException(error)
})

const gitHubUserStore = new GitHubUserStore(
  new GitHubUserDatabase('GitHubUserDatabase')
)
const cloningRepositoriesStore = new CloningRepositoriesStore()
const issuesStore = new IssuesStore(new IssuesDatabase('IssuesDatabase'))
const statsStore = new StatsStore(
  new StatsDatabase('StatsDatabase'),
  new UiActivityMonitor()
)
const signInStore = new SignInStore()

const accountsStore = new AccountsStore(localStorage, TokenStore)
const repositoriesStore = new RepositoriesStore(
  new RepositoriesDatabase('Database')
)

const pullRequestStore = new PullRequestStore(
  new PullRequestDatabase('PullRequestDatabase'),
  repositoriesStore
)

const repositoryStateManager = new RepositoryStateCache(repo =>
  gitHubUserStore.getUsersForRepository(repo)
)

const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

const commitStatusStore = new CommitStatusStore(accountsStore)

const appStore = new AppStore(
  gitHubUserStore,
  cloningRepositoriesStore,
  issuesStore,
  statsStore,
  signInStore,
  accountsStore,
  repositoriesStore,
  pullRequestStore,
  repositoryStateManager,
  apiRepositoriesStore
)

const dispatcher = new Dispatcher(
  appStore,
  repositoryStateManager,
  statsStore,
  commitStatusStore
)

dispatcher.registerErrorHandler(defaultErrorHandler)
dispatcher.registerErrorHandler(upstreamAlreadyExistsHandler)
dispatcher.registerErrorHandler(externalEditorErrorHandler)
dispatcher.registerErrorHandler(openShellErrorHandler)
dispatcher.registerErrorHandler(mergeConflictHandler)
dispatcher.registerErrorHandler(lfsAttributeMismatchHandler)
dispatcher.registerErrorHandler(gitAuthenticationErrorHandler)
dispatcher.registerErrorHandler(pushNeedsPullHandler)
dispatcher.registerErrorHandler(backgroundTaskHandler)
dispatcher.registerErrorHandler(missingRepositoryHandler)

if (enablePullWithRebase()) {
  dispatcher.registerErrorHandler(rebaseConflictsHandler)
}

document.body.classList.add(`platform-${process.platform}`)

dispatcher.setAppFocusState(remote.getCurrentWindow().isFocused())

ipcRenderer.on('focus', () => {
  const { selectedState } = appStore.getState()

  // Refresh the currently selected repository on focus (if
  // we have a selected repository, that is not cloning).
  if (
    selectedState &&
    !(selectedState.type === SelectionType.CloningRepository)
  ) {
    dispatcher.refreshRepository(selectedState.repository)
  }

  dispatcher.setAppFocusState(true)
})

ipcRenderer.on('blur', () => {
  // Make sure we stop highlighting the menu button (on non-macOS)
  // when someone uses Alt+Tab to switch application since we won't
  // get the onKeyUp event for the Alt key in that case.
  dispatcher.setAccessKeyHighlightState(false)
  dispatcher.setAppFocusState(false)
})

ipcRenderer.on(
  'url-action',
  (event: Electron.IpcMessageEvent, { action }: { action: URLActionType }) => {
    dispatcher.dispatchURLAction(action)
  }
)

ReactDOM.render(
  <App
    dispatcher={dispatcher}
    appStore={appStore}
    repositoryStateManager={repositoryStateManager}
    issuesStore={issuesStore}
    gitHubUserStore={gitHubUserStore}
    startTime={startTime}
  />,
  document.getElementById('desktop-app-container')!
)
