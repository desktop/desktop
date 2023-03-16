import '../lib/logging/renderer/install'

import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as Path from 'path'
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
  discardChangesHandler,
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

import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import { enableUnhandledRejectionReporting } from '../lib/feature-flag'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import {
  ApplicationTheme,
  supportsSystemThemeChanges,
} from './lib/application-theme'
import { trampolineUIHelper } from '../lib/trampoline/trampoline-ui-helper'
import { AliveStore } from '../lib/stores/alive-store'
import { NotificationsStore } from '../lib/stores/notifications-store'
import * as ipcRenderer from '../lib/ipc-renderer'
import { migrateRendererGUID } from '../lib/get-renderer-guid'
import { initializeRendererNotificationHandler } from '../lib/notifications/notification-handler'
import { Grid } from 'react-virtualized'
import { NotificationsDebugStore } from '../lib/stores/notifications-debug-store'

if (__DEV__) {
  installDevGlobals()
}

migrateRendererGUID()

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

        if (currentState.errorCount > 0) {
          extra.activeAppErrors = `${currentState.errorCount}`
        }

        extra.repositoryCount = `${currentState.repositories.length}`
        extra.windowState = currentState.windowState ?? 'Unknown'
        extra.accounts = `${currentState.accounts.length}`

        extra.automaticallySwitchTheme = `${
          currentState.selectedTheme === ApplicationTheme.System &&
          supportsSystemThemeChanges()
        }`
      }
    } catch (err) {
      /* ignore */
    }

    sendErrorReport(error, extra, nonFatal ?? false)
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

// HACK: this is a workaround for a known crash in the Dev Tools on Electron 19
// See https://github.com/electron/electron/issues/34350
window.onerror = e =>
  e === 'Uncaught EvalError: Possible side-effect in debug-evaluate'

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

const repositoryStateManager = new RepositoryStateCache(statsStore)

const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

const commitStatusStore = new CommitStatusStore(accountsStore)
const aheadBehindStore = new AheadBehindStore()

const aliveStore = new AliveStore(accountsStore)

const notificationsStore = new NotificationsStore(
  accountsStore,
  aliveStore,
  pullRequestCoordinator,
  statsStore
)

const notificationsDebugStore = new NotificationsDebugStore(
  accountsStore,
  notificationsStore,
  pullRequestCoordinator
)

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
  apiRepositoriesStore,
  notificationsStore
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
dispatcher.registerErrorHandler(discardChangesHandler)

document.body.classList.add(`platform-${process.platform}`)

dispatcher.initializeAppFocusState()

initializeRendererNotificationHandler(notificationsStore)

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

ipcRenderer.on('url-action', (_, action) =>
  dispatcher.dispatchURLAction(action)
)

// react-virtualized will use the literal string "grid" as the 'aria-label'
// attribute unless we override it. This is a problem because aria-label should
// not be set unless there's a compelling reason for it[1].
//
// Similarly the default props call for the 'aria-readonly' attribute to be set
// to true which according to MDN doesn't fit our use case[2]:
//
// > This indicates to the user that an interactive element that would normally
// > be focusable and copyable has been placed in a read-only (not disabled)
// > state.
//
// 1. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-label
// 2. https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Attributes/aria-readonly
;(function (
  defaults: Record<string, unknown> | undefined,
  types: Record<string, unknown> | undefined
) {
  ;['aria-label', 'aria-readonly'].forEach(k => {
    delete defaults?.[k]
    delete types?.[k]
  })
})(Grid.defaultProps, Grid.propTypes)

ReactDOM.render(
  <App
    dispatcher={dispatcher}
    appStore={appStore}
    repositoryStateManager={repositoryStateManager}
    issuesStore={issuesStore}
    gitHubUserStore={gitHubUserStore}
    aheadBehindStore={aheadBehindStore}
    notificationsDebugStore={notificationsDebugStore}
    startTime={startTime}
  />,
  document.getElementById('desktop-app-container')!
)
