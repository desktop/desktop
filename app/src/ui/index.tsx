import '../lib/logging/renderer/install'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'

import { ipcRenderer, remote } from 'electron'

import { App } from './app'
import { Dispatcher, AppStore, GitHubUserStore, GitHubUserDatabase, CloningRepositoriesStore, EmojiStore } from '../lib/dispatcher'
import { URLActionType } from '../lib/parse-url'
import { SelectionType } from '../lib/app-state'
import { StatsDatabase, StatsStore } from '../lib/stats'
import { IssuesDatabase, IssuesStore, SignInStore } from '../lib/dispatcher'
import {
  defaultErrorHandler,
  createMissingRepositoryHandler,
  backgroundTaskHandler,
  unhandledExceptionHandler,
} from '../lib/dispatcher'
import { shellNeedsPatching, updateEnvironmentForProcess } from '../lib/shell'
import { installDevGlobals } from './install-globals'
import { reportUncaughtException, sendErrorReport } from './main-process-proxy'
import { getOS } from '../lib/get-os'
import { getGUID } from '../lib/stats'
import { enableSourceMaps, withSourceMappedStack } from '../lib/source-map-support'

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
    console.error(`An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`)
  } else {
    sendErrorReport(error, {
      osVersion: getOS(),
      guid: getGUID(),
    })
  }

  reportUncaughtException(error)
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
dispatcher.registerErrorHandler(backgroundTaskHandler)
dispatcher.registerErrorHandler(createMissingRepositoryHandler(appStore))
dispatcher.registerErrorHandler(unhandledExceptionHandler)

document.body.classList.add(`platform-${process.platform}`)

dispatcher.setAppFocusState(remote.getCurrentWindow().isFocused())

ipcRenderer.on('focus', () => {
  const state = appStore.getState().selectedState
  if (!state || state.type !== SelectionType.Repository) { return }

  dispatcher.setAppFocusState(true)
  dispatcher.refreshRepository(state.repository)
})

ipcRenderer.on('blur', () => {
  // Make sure we stop highlighting the menu button (on non-macOS)
  // when someone uses Alt+Tab to switch application since we won't
  // get the onKeyUp event for the Alt key in that case.
  dispatcher.setAccessKeyHighlightState(false)
  dispatcher.setAppFocusState(false)
})

ipcRenderer.on('url-action', (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
  dispatcher.dispatchURLAction(action)
})

ReactDOM.render(
  <App dispatcher={dispatcher} appStore={appStore} startTime={startTime}/>,
  document.getElementById('desktop-app-container')!,
)
