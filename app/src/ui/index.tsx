import '../lib/logging/renderer/install'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'

import * as moment from 'moment'

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
  localChangesOverwrittenHandler,
  refusedWorkflowUpdate,
  samlReauthRequired,
  insufficientGitHubRepoPermissions,
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
import { SelectionType, IAppState } from '../lib/app-state'
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
import { CommitStatusStore } from '../lib/stores/commit-status-store'
import { PullRequestCoordinator } from '../lib/stores/pull-request-coordinator'

// We're using a polyfill for the upcoming CSS4 `:focus-ring` pseudo-selector.
// This allows us to not have to override default accessibility driven focus
// styles for buttons in the case when a user clicks on a button. This also
// gives better visibility to individuals who navigate with the keyboard.
//
// See:
//   https://github.com/WICG/focus-ring
//   Focus Ring! -- A11ycasts #16: https://youtu.be/ilj2P5-5CjI
import 'wicg-focus-ring'

// setup this moment.js plugin so we can use easier
// syntax for formatting time duration
import momentDurationFormatSetup from 'moment-duration-format'
import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import { enableUnhandledRejectionReporting } from '../lib/feature-flag'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
} from './lib/application-theme'
import { trampolineUIHelper } from '../lib/trampoline/trampoline-ui-helper'

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

// Ensure that dugite infers the GIT_EXEC_PATH
// based on the LOCAL_GIT_DIRECTORY env variable
// instead of just blindly trusting what's set in
// the current environment. See https://git.io/JJ7KF
delete process.env.GIT_EXEC_PATH

momentDurationFormatSetup(moment)

const startTime = performance.now()

if (!process.env.TEST_ENV) {
  /* This is the magic trigger for webpack to go compile
   * our sass into css and inject it into the DOM. */
  require('../../styles/desktop.scss')
}

// TODO (electron): Remove this once
// https://bugs.chromium.org/p/chromium/issues/detail?id=1113293
// gets fixed and propagated to electron.
if (__DARWIN__) {
  require('../lib/fix-emoji-spacing')
}

let currentState: IAppState | null = null

const sendErrorWithContext = (
  error: Error,
  context: Record<string, string> = {},
  nonFatal?: boolean
) => {
  error = withSourceMappedStack(error)

  console.error('Uncaught exception', error)

  if (__DEV__ || process.env.TEST_ENV) {
    console.error(
      `An uncaught exception was thrown. If this were a production build it would be reported to Central. Instead, maybe give it a lil lookyloo.`
    )
  } else {
    const extra: Record<string, string> = {
      osVersion: getOS(),
      guid: getGUID(),
      ...context,
    }

    try {
      if (currentState) {
        if (currentState.currentBanner !== null) {
          extra.currentBanner = currentState.currentBanner.type
        }

        if (currentState.currentPopup !== null) {
          extra.currentPopup = `${currentState.currentPopup.type}`
        }

        if (currentState.selectedState !== null) {
          extra.selectedState = `${currentState.selectedState.type}`

          if (currentState.selectedState.type === SelectionType.Repository) {
            extra.selectedRepositorySection = `${currentState.selectedState.state.selectedSection}`
          }
        }

        if (currentState.currentFoldout !== null) {
          extra.currentFoldout = `${currentState.currentFoldout.type}`
        }

        if (currentState.showWelcomeFlow) {
          extra.inWelcomeFlow = 'true'
        }

        if (currentState.windowZoomFactor !== 1) {
          extra.windowZoomFactor = `${currentState.windowZoomFactor}`
        }

        if (currentState.errors.length > 0) {
          extra.activeAppErrors = `${currentState.errors.length}`
        }

        extra.repositoryCount = `${currentState.repositories.length}`
        extra.windowState = currentState.windowState
        extra.accounts = `${currentState.accounts.length}`

        extra.automaticallySwitchTheme = `${
          currentState.selectedTheme === ApplicationTheme.System &&
          supportsSystemThemeChanges()
        }`
      }
    } catch (err) {
      /* ignore */
    }

    sendErrorReport(error, extra, nonFatal)
  }
}

process.once('uncaughtException', (error: Error) => {
  sendErrorWithContext(error)
  reportUncaughtException(error)
})

// See sendNonFatalException for more information
process.on(
  'send-non-fatal-exception',
  (error: Error, context?: { [key: string]: string }) => {
    sendErrorWithContext(error, context, true)
  }
)

/**
 * Chromium won't crash on an unhandled rejection (similar to how it won't crash
 * on an unhandled error). We've taken the approach that unhandled errors should
 * crash the app and very likely we should do the same thing for unhandled
 * promise rejections but that's a bit too risky to do until we've established
 * some sense of how often it happens. For now this simply stores the last
 * rejection so that we can pass it along with the crash report if the app does
 * crash. Note that this does not prevent the default browser behavior of
 * logging since we're not calling `preventDefault` on the event.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/API/Window/unhandledrejection_event
 */
window.addEventListener('unhandledrejection', ev => {
  if (enableUnhandledRejectionReporting() && ev.reason instanceof Error) {
    sendNonFatalException('unhandledRejection', ev.reason)
  }
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

const pullRequestCoordinator = new PullRequestCoordinator(
  pullRequestStore,
  repositoriesStore
)

const repositoryStateManager = new RepositoryStateCache()

const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

const commitStatusStore = new CommitStatusStore(accountsStore)
const aheadBehindStore = new AheadBehindStore()

const appStore = new AppStore(
  gitHubUserStore,
  cloningRepositoriesStore,
  issuesStore,
  statsStore,
  signInStore,
  accountsStore,
  repositoriesStore,
  pullRequestCoordinator,
  repositoryStateManager,
  apiRepositoriesStore
)

appStore.onDidUpdate(state => {
  currentState = state
})

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
dispatcher.registerErrorHandler(insufficientGitHubRepoPermissions)
dispatcher.registerErrorHandler(gitAuthenticationErrorHandler)
dispatcher.registerErrorHandler(pushNeedsPullHandler)
dispatcher.registerErrorHandler(samlReauthRequired)
dispatcher.registerErrorHandler(backgroundTaskHandler)
dispatcher.registerErrorHandler(missingRepositoryHandler)
dispatcher.registerErrorHandler(localChangesOverwrittenHandler)
dispatcher.registerErrorHandler(rebaseConflictsHandler)
dispatcher.registerErrorHandler(refusedWorkflowUpdate)

document.body.classList.add(`platform-${process.platform}`)

dispatcher.setAppFocusState(remote.getCurrentWindow().isFocused())

// The trampoline UI helper needs a reference to the dispatcher before it's used
trampolineUIHelper.setDispatcher(dispatcher)

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
  (event: Electron.IpcRendererEvent, { action }: { action: URLActionType }) => {
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
    aheadBehindStore={aheadBehindStore}
    startTime={startTime}
  />,
  document.getElementById('desktop-app-container')!
)
