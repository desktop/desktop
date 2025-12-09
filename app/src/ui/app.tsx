import * as React from 'react'
import * as Path from 'path'

import { TransitionGroup, CSSTransition } from 'react-transition-group'
import {
  IAppState,
  RepositorySectionTab,
  FoldoutType,
  SelectionType,
  HistoryTabMode,
} from '../lib/app-state'
import { Dispatcher } from './dispatcher'
import { AppStore, GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { shell } from '../lib/app-shell'
import { updateStore, UpdateStatus } from './lib/update-store'
import { RetryAction } from '../models/retry-actions'
import { FetchType } from '../models/fetch'
import { shouldRenderApplicationMenu } from './lib/features'
import { matchExistingRepository } from '../lib/repository-matching'
import { getVersion, getName } from './lib/app-proxy'
import {
  getOS,
  isOSNoLongerSupportedByElectron,
  isMacOSAndNoLongerSupportedByElectron,
  isWindowsAndNoLongerSupportedByElectron,
} from '../lib/get-os'
import { MenuEvent, isTestMenuEvent } from '../main-process/menu'
import {
  Repository,
  getGitHubHtmlUrl,
  getNonForkGitHubRepository,
  isRepositoryWithGitHubRepository,
} from '../models/repository'
import { Branch } from '../models/branch'
import { PreferencesTab } from '../models/preferences'
import { findItemByAccessKey, itemIsSelectable } from '../models/app-menu'
import {
  Account,
  isDotComAccount,
  isEnterpriseAccount,
} from '../models/account'
import { TipState } from '../models/tip'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { CloningRepository } from '../models/cloning-repository'

import { TitleBar, ZoomInfo, FullScreenInfo } from './window'
import { Button } from './lib/button'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { RenameBranch } from './rename-branch'
import { DeleteBranch, DeleteRemoteBranch } from './delete-branch'
import { CloningRepositoryView } from './cloning-repository'
import {
  Toolbar,
  ToolbarDropdown,
  DropdownState,
  ToolbarDropdownStyle,
  PushPullButton,
  BranchDropdown,
  RevertProgress,
} from './toolbar'
import { iconForRepository, OcticonSymbol, Octicon } from './octicons'
import * as octicons from './octicons/octicons.generated'
import {
  showCertificateTrustDialog,
  sendReady,
  isInApplicationFolder,
  selectAllWindowContents,
  installWindowsCLI,
  uninstallWindowsCLI,
  showOpenDialog,
} from './main-process-proxy'
import { DiscardChanges } from './discard-changes'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { UpdateAvailable, renderBanner } from './banners'
import { Preferences } from './preferences'
import { RepositorySettings } from './repository-settings'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { AddExistingRepository, CreateRepository, AddRepositoryDialog } from './add-repository'
import { CloneRepository } from './clone-repository'
import { CloneableRepositoryFilterList } from './clone-repository/cloneable-repository-filter-list'
import { ILocalRepoInfo, ILocalOnlyRepoInfo } from './clone-repository/group-repositories'
import { CreateBranch } from './create-branch'
import { SignIn } from './sign-in'
import { InstallGit } from './install-git'
import { EditorError } from './editor'
import { About } from './about'
import { Publish } from './publish-repository'
import { Acknowledgements } from './acknowledgements'
import { UntrustedCertificate } from './untrusted-certificate'
import { NoRepositoriesView } from './no-repositories'
import { ProjectView } from './project-view/project-view'
import { ConfirmRemoveRepository } from './remove-repository'
import { TermsAndConditions } from './terms-and-conditions'
import { PushBranchCommits } from './branches'
import { CLIInstalled } from './cli-installed'
import { GenericGitAuthentication } from './generic-git-auth'
import { ShellError } from './shell'
import { InitializeLFS, AttributeMismatch } from './lfs'
import { UpstreamAlreadyExists } from './upstream-already-exists'
import { ReleaseNotes } from './release-notes'
import { DeletePullRequest } from './delete-branch/delete-pull-request-dialog'
import { CommitConflictsWarning } from './merge-conflicts'
import { AppTheme } from './app-theme'
import { ApplicationTheme } from './lib/application-theme'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { PopupType, Popup } from '../models/popup'
import { OversizedFiles } from './changes/oversized-files-warning'
import { PushNeedsPullWarning } from './push-needs-pull'
import { getCurrentBranchForcePushState } from '../lib/rebase'
import { Banner, BannerType } from '../models/banner'
import { StashAndSwitchBranch } from './stash-changes/stash-and-switch-branch-dialog'
import { OverwriteStash } from './stash-changes/overwrite-stashed-changes-dialog'
import { ConfirmDiscardStashDialog } from './stashing/confirm-discard-stash'
import { ConfirmCheckoutCommitDialog } from './checkout/confirm-checkout-commit'
import { CreateTutorialRepositoryDialog } from './no-repositories/create-tutorial-repository-dialog'
import { ConfirmExitTutorial } from './tutorial'
import { TutorialStep, isValidTutorialStep } from '../models/tutorial-step'
import { WorkflowPushRejectedDialog } from './workflow-push-rejected/workflow-push-rejected'
import { SAMLReauthRequiredDialog } from './saml-reauth-required/saml-reauth-required'
import { CreateForkDialog } from './forks/create-fork-dialog'
import { findContributionTargetDefaultBranch } from '../lib/branch'
import {
  GitHubRepository,
  hasWritePermission,
} from '../models/github-repository'
import { CreateTag } from './create-tag'
import { DeleteTag } from './delete-tag'
import { ChooseForkSettings } from './choose-fork-settings'
import { DiscardSelection } from './discard-changes/discard-selection-dialog'
import { LocalChangesOverwrittenDialog } from './local-changes-overwritten/local-changes-overwritten-dialog'
import memoizeOne from 'memoize-one'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import { getAccountForRepository } from '../lib/get-account-for-repository'
import { CommitOneLine } from '../models/commit'
import { CommitDragElement } from './drag-elements/commit-drag-element'
import classNames from 'classnames'
import { MoveToApplicationsFolder } from './move-to-applications-folder'
import { ChangeRepositoryAlias } from './change-repository-alias/change-repository-alias-dialog'
import { ThankYou } from './thank-you'
import {
  getUserContributions,
  hasUserAlreadyBeenCheckedOrThanked,
  updateLastThankYou,
} from '../lib/thank-you'
import { ReleaseNote } from '../models/release-notes'
import { CommitMessageDialog } from './commit-message/commit-message-dialog'
import { buildAutocompletionProviders } from './autocompletion'
import { DragType, DropTargetSelector } from '../models/drag-drop'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { MultiCommitOperation } from './multi-commit-operation/multi-commit-operation'
import { WarnLocalChangesBeforeUndo } from './undo/warn-local-changes-before-undo'
import { WarningBeforeReset } from './reset/warning-before-reset'
import { InvalidatedToken } from './invalidated-token/invalidated-token'
import { MultiCommitOperationKind } from '../models/multi-commit-operation'
import { AddSSHHost } from './ssh/add-ssh-host'
import { SSHKeyPassphrase } from './ssh/ssh-key-passphrase'
import { getMultiCommitOperationChooseBranchStep } from '../lib/multi-commit-operation'
import { ConfirmForcePush } from './rebase/confirm-force-push'
import { PullRequestChecksFailed } from './notifications/pull-request-checks-failed'
import { CICheckRunRerunDialog } from './check-runs/ci-check-run-rerun-dialog'
import { CreateTaskDialog } from './tasks'
import { WarnForcePushDialog } from './multi-commit-operation/dialog/warn-force-push-dialog'
import { generateRepositoryListContextMenu } from './repositories-list/repository-list-item-context-menu'
import * as ipcRenderer from '../lib/ipc-renderer'
import { DiscardChangesRetryDialog } from './discard-changes/discard-changes-retry-dialog'
import { PullRequestReview } from './notifications/pull-request-review'
import { getRepositoryType } from '../lib/git'
import { SSHUserPassword } from './ssh/ssh-user-password'
import { showContextualMenu } from '../lib/menu-item'
import { UnreachableCommitsDialog } from './history/unreachable-commits-dialog'
import { OpenPullRequestDialog } from './open-pull-request/open-pull-request-dialog'
import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import { createCommitURL } from '../lib/commit-url'
import { InstallingUpdate } from './installing-update/installing-update'
import { DialogStackContext } from './dialog'
import { TestNotifications } from './test-notifications/test-notifications'
import { NotificationsDebugStore } from '../lib/stores/notifications-debug-store'
import { PullRequestComment } from './notifications/pull-request-comment'
import { UnknownAuthors } from './unknown-authors/unknown-authors-dialog'
import { UnsupportedOSBannerDismissedAtKey } from './banners/os-version-no-longer-supported-banner'
import { offsetFromNow } from '../lib/offset-from'
import { getNumber } from '../lib/local-storage'
import { IconPreviewDialog } from './octicons/icon-preview-dialog'
import { isCertificateErrorSuppressedFor } from '../lib/suppress-certificate-error'
import { webUtils } from 'electron'
import { showTestUI } from './lib/test-ui-components/test-ui-components'
import { ConfirmCommitFilteredChanges } from './changes/confirm-commit-filtered-changes-dialog'
import { AboutTestDialog } from './about/about-test-dialog'
import { enableMultipleEnterpriseAccounts } from '../lib/feature-flag'
import {
  ISecretScanResult,
  PushProtectionErrorDialog,
} from './secret-scanning/push-protection-error-dialog'
import { GenerateCommitMessageOverrideWarning } from './generate-commit-message/generate-commit-message-override-warning'
import { GenerateCommitMessageDisclaimer } from './generate-commit-message/generate-commit-message-disclaimer'
import { IAPICreatePushProtectionBypassResponse, getDotComAPIEndpoint, IAPIRepository, IAPIProjectV2 } from '../lib/api'
import {
  BypassPushProtectionDialog,
  BypassReason,
  BypassReasonType,
} from './secret-scanning/bypass-push-protection-dialog'

const MinuteInMilliseconds = 1000 * 60
const HourInMilliseconds = MinuteInMilliseconds * 60

/**
 * Check for updates every 4 hours
 */
const UpdateCheckInterval = 4 * HourInMilliseconds

/**
 * Send usage stats every 4 hours
 */
const SendStatsInterval = 4 * HourInMilliseconds

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly repositoryStateManager: RepositoryStateCache
  readonly appStore: AppStore
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly aheadBehindStore: AheadBehindStore
  readonly notificationsDebugStore: NotificationsDebugStore
  readonly startTime: number
}

export const dialogTransitionTimeout = {
  enter: 250,
  exit: 100,
}

export const bannerTransitionTimeout = { enter: 500, exit: 400 }

/**
 * The time to delay (in ms) from when we've loaded the initial state to showing
 * the window. This is try to give Chromium enough time to flush our latest DOM
 * changes. See https://github.com/desktop/desktop/issues/1398.
 */
const ReadyDelay = 100
export class App extends React.Component<IAppProps, IAppState> {
  private loading = true

  /**
   * Used on non-macOS platforms to support the Alt key behavior for
   * the custom application menu. See the event handlers for window
   * keyup and keydown.
   */
  private lastKeyPressed: string | null = null

  private updateIntervalHandle?: number

  private repositoryViewRef = React.createRef<RepositoryView>()

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup !== null
  }

  /**
   * Returns a memoized instance of onPopupDismissed() bound to the
   * passed popupType, so it can be used in render() without creating
   * multiple instances when the component gets re-rendered.
   */
  private getOnPopupDismissedFn = memoizeOne((popupId: string) => {
    return () => this.onPopupDismissed(popupId)
  })

  /**
   * Helper method to mimic the behavior prior to us supporting multiple
   * enterprise accounts. Takes a list of accounts and returns the first
   * dotcom account (if any) followed by the first enterprise account (if any)
   */
  private oneAccountPerKind = memoizeOne((accounts: ReadonlyArray<Account>) =>
    [accounts.find(isDotComAccount), accounts.find(isEnterpriseAccount)].filter(
      x => x !== undefined
    )
  )

  public constructor(props: IAppProps) {
    super(props)

    props.dispatcher.loadInitialState().then(() => {
      this.loading = false
      this.forceUpdate()

      requestIdleCallback(
        () => {
          const now = performance.now()
          sendReady(now - props.startTime)

          requestIdleCallback(() => {
            this.performDeferredLaunchActions()
          })
        },
        { timeout: ReadyDelay }
      )
    })

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)
    })

    props.appStore.onDidError(error => {
      props.dispatcher.postError(error)
    })

    ipcRenderer.on('menu-event', (_, name) => this.onMenuEvent(name))

    updateStore.onDidChange(async state => {
      const status = state.status

      if (
        !(__RELEASE_CHANNEL__ === 'development') &&
        status === UpdateStatus.UpdateReady
      ) {
        this.props.dispatcher.setUpdateBannerVisibility(true)
      }

      if (
        status !== UpdateStatus.UpdateReady &&
        (await updateStore.isUpdateShowcase())
      ) {
        this.props.dispatcher.setUpdateShowCaseVisibility(true)
      }
    })

    updateStore.onError(error => {
      log.error(`Error checking for updates`, error)

      this.props.dispatcher.postError(error)
    })

    ipcRenderer.on('launch-timing-stats', (_, stats) => {
      console.info(`App ready time: ${stats.mainReadyTime}ms`)
      console.info(`Load time: ${stats.loadTime}ms`)
      console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

      this.props.dispatcher.recordLaunchStats(stats)
    })

    ipcRenderer.on('certificate-error', (_, certificate, error, url) => {
      if (isCertificateErrorSuppressedFor(url)) {
        return
      }

      this.props.dispatcher.showPopup({
        type: PopupType.UntrustedCertificate,
        certificate,
        url,
      })
    })

    dragAndDropManager.onDragEnded(this.onDragEnd)
  }

  public componentWillUnmount() {
    window.clearInterval(this.updateIntervalHandle)

    if (__DARWIN__) {
      window.removeEventListener('keydown', this.onMacOSWindowKeyDown)
    }
  }

  private async performDeferredLaunchActions() {
    // Loading emoji is super important but maybe less important that loading
    // the app. So defer it until we have some breathing space.
    this.props.appStore.loadEmoji()

    this.props.dispatcher.reportStats()
    setInterval(() => this.props.dispatcher.reportStats(), SendStatsInterval)

    this.props.dispatcher.installGlobalLFSFilters(false)

    // We only want to automatically check for updates on beta and prod
    if (
      __RELEASE_CHANNEL__ !== 'development' &&
      __RELEASE_CHANNEL__ !== 'test'
    ) {
      setInterval(() => this.checkForUpdates(true), UpdateCheckInterval)
      this.checkForUpdates(true)
    } else if (await updateStore.isUpdateShowcase()) {
      // The only purpose of this call is so we can see the showcase on dev/test
      // env. Prod and beta environment will trigger this during automatic check
      // for updates.
      this.props.dispatcher.setUpdateShowCaseVisibility(true)
    }

    log.info(`launching: ${getVersion()} (${getOS()})`)
    log.info(`execPath: '${process.execPath}'`)

    // Only show the popup in beta/production releases and mac machines
    if (
      __DEV__ === false &&
      this.state.askToMoveToApplicationsFolderSetting &&
      __DARWIN__ &&
      (await isInApplicationFolder()) === false
    ) {
      this.showPopup({ type: PopupType.MoveToApplicationsFolder })
    }

    this.setOnOpenBanner()
  }

  /**
   * This method sets the app banner on opening the app. The last banner set in
   * this method will be the one shown as only one banner is shown at a time.
   * The only exception is the update available banner is always
   * prioritized over other banners.
   *
   * Priority:
   * 1. OS Not Supported by Electron
   * 2. Accessibility Settings Banner
   * 3. Thank you banner
   */
  private setOnOpenBanner() {
    if (isOSNoLongerSupportedByElectron()) {
      const dismissedAt = getNumber(UnsupportedOSBannerDismissedAtKey, 0)

      // Remind the user that they're running an unsupported OS every 90 days
      if (dismissedAt < offsetFromNow(-90, 'days')) {
        this.setBanner({ type: BannerType.OSVersionNoLongerSupported })
        return
      }
    }

    this.checkIfThankYouIsInOrder()
  }

  private onMenuEvent(name: MenuEvent): any {
    // Don't react to menu events when an error dialog is shown.
    if (name !== 'test-app-error' && this.state.errorCount > 1) {
      return
    }

    switch (name) {
      case 'push':
        return this.push()
      case 'force-push':
        return this.push({ forceWithLease: true })
      case 'pull':
        return this.pull()
      case 'fetch':
        return this.fetch()
      case 'show-changes':
        return this.showChanges(true)
      case 'show-history':
        return this.showHistory(true)
      case 'choose-repository':
        return this.chooseRepository()
      case 'add-local-repository':
        return this.showAddLocalRepo()
      case 'create-branch':
        return this.showCreateBranch()
      case 'show-branches':
        return this.showBranches()
      case 'remove-repository':
        return this.removeRepository(this.getRepository())
      case 'create-repository':
        return this.showCreateRepository()
      case 'rename-branch':
        return this.renameBranch()
      case 'delete-branch':
        return this.deleteBranch()
      case 'discard-all-changes':
        return this.discardAllChanges()
      case 'stash-all-changes':
        return this.stashAllChanges()
      case 'show-preferences':
        return this.props.dispatcher.showPopup({ type: PopupType.Preferences })
      case 'open-working-directory':
        return this.openCurrentRepositoryWorkingDirectory()
      case 'update-branch-with-contribution-target-branch':
        this.props.dispatcher.incrementMetric(
          'updateFromDefaultBranchMenuCount'
        )
        return this.updateBranchWithContributionTargetBranch()
      case 'compare-to-branch':
        return this.showHistory(false, true)
      case 'merge-branch':
        this.props.dispatcher.recordMenuInitiatedMerge()
        return this.mergeBranch()
      case 'squash-and-merge-branch':
        this.props.dispatcher.recordMenuInitiatedMerge(true)
        return this.mergeBranch(true)
      case 'rebase-branch':
        this.props.dispatcher.incrementMetric('rebaseCurrentBranchMenuCount')
        return this.showRebaseDialog()
      case 'show-repository-settings':
        return this.showRepositorySettings()
      case 'view-repository-on-github':
        return this.viewRepositoryOnGitHub()
      case 'compare-on-github':
        return this.openBranchOnGitHub('compare')
      case 'branch-on-github':
        return this.openBranchOnGitHub('tree')
      case 'create-issue-in-repository-on-github':
        return this.openIssueCreationOnGitHub()
      case 'open-in-shell':
        return this.openCurrentRepositoryInShell()
      case 'clone-repository':
        return this.showCloneRepo()
      case 'show-about':
        return this.showAbout()
      case 'go-to-commit-message':
        return this.goToCommitMessage()
      case 'open-pull-request':
        return this.openPullRequest()
      case 'preview-pull-request':
        return this.startPullRequest()
      case 'install-darwin-cli':
        return this.props.dispatcher.installDarwinCLI()
      case 'install-windows-cli':
        return installWindowsCLI()
      case 'uninstall-windows-cli':
        return uninstallWindowsCLI()
      case 'open-external-editor':
        return this.openCurrentRepositoryInExternalEditor()
      case 'select-all':
        return this.selectAll()
      case 'show-stashed-changes':
        return this.showStashedChanges()
      case 'hide-stashed-changes':
        return this.hideStashedChanges()
      case 'find-text':
        return this.findText()
      case 'increase-active-resizable-width':
        return this.resizeActiveResizable('increase-active-resizable-width')
      case 'decrease-active-resizable-width':
        return this.resizeActiveResizable('decrease-active-resizable-width')
      case 'toggle-changes-filter':
        return this.toggleChangesFilterVisibility()
      default:
        if (isTestMenuEvent(name)) {
          return showTestUI(
            name,
            this.getRepository(),
            this.props.dispatcher,
            this.state.emoji
          )
        }
        return assertNever(name, `Unknown menu event name: ${name}`)
    }
  }

  /**
   * This method dispatches an action to update the changes filter visibility
   */
  private toggleChangesFilterVisibility() {
    this.props.dispatcher.toggleChangesFilterVisibility()
  }

  /**
   * Handler for the 'increase-active-resizable-width' and
   * 'decrease-active-resizable-width' menu event, dispatches a custom DOM event
   * originating from the element which currently has keyboard focus. Components
   * have a chance to intercept this event and implement their resize logic.
   */
  private resizeActiveResizable(
    menuId:
      | 'increase-active-resizable-width'
      | 'decrease-active-resizable-width'
  ) {
    document.activeElement?.dispatchEvent(
      new CustomEvent(menuId, {
        bubbles: true,
        cancelable: true,
      })
    )
  }

  /**
   * Handler for the 'select-all' menu event, dispatches
   * a custom DOM event originating from the element which
   * currently has keyboard focus. Components have a chance
   * to intercept this event and implement their own 'select
   * all' logic.
   */
  private selectAll() {
    const event = new CustomEvent('select-all', {
      bubbles: true,
      cancelable: true,
    })

    if (
      document.activeElement != null &&
      document.activeElement.dispatchEvent(event)
    ) {
      selectAllWindowContents()
    }
  }

  /**
   * Handler for the 'find-text' menu event, dispatches
   * a custom DOM event originating from the element which
   * currently has keyboard focus (or the document if no element
   * has focus). Components have a chance to intercept this
   * event and implement their own 'find-text' logic. One
   * example of this custom event is the text diff which
   * will trigger a search dialog when seeing this event.
   */
  private findText() {
    const event = new CustomEvent('find-text', {
      bubbles: true,
      cancelable: true,
    })

    if (document.activeElement != null) {
      document.activeElement.dispatchEvent(event)
    } else {
      document.dispatchEvent(event)
    }
  }

  private async goToCommitMessage() {
    await this.showChanges(false)
    this.props.dispatcher.setCommitMessageFocus(true)
  }

  private checkForUpdates(
    inBackground: boolean,
    skipGuidCheck: boolean = false
  ) {
    if (__LINUX__ || __RELEASE_CHANNEL__ === 'development') {
      return
    }

    if (isWindowsAndNoLongerSupportedByElectron()) {
      log.error(
        `Can't check for updates on Windows 8.1 or older. Next available update only supports Windows 10 and later`
      )
      return
    }

    if (isMacOSAndNoLongerSupportedByElectron()) {
      log.error(
        `Can't check for updates on macOS 10.15 or older. Next available update only supports macOS 11.0 and later`
      )
      return
    }

    updateStore.checkForUpdates(inBackground, skipGuidCheck)
  }

  private updateBranchWithContributionTargetBranch() {
    const { selectedState } = this.state
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return
    }

    const { state, repository } = selectedState

    const contributionTargetDefaultBranch = findContributionTargetDefaultBranch(
      repository,
      state.branchesState
    )
    if (!contributionTargetDefaultBranch) {
      return
    }

    this.props.dispatcher.initializeMergeOperation(
      repository,
      false,
      contributionTargetDefaultBranch
    )

    const { mergeStatus } = state.compareState
    this.props.dispatcher.mergeBranch(
      repository,
      contributionTargetDefaultBranch,
      mergeStatus
    )
  }

  private mergeBranch(isSquash: boolean = false) {
    const selectedState = this.state.selectedState
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return
    }
    const { repository } = selectedState
    this.props.dispatcher.startMergeBranchOperation(repository, isSquash)
  }

  private openBranchOnGitHub(view: 'tree' | 'compare') {
    const htmlURL = this.getCurrentRepositoryGitHubURL()
    if (!htmlURL) {
      return
    }

    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const branchTip = state.state.branchesState.tip
    if (
      branchTip.kind !== TipState.Valid ||
      !branchTip.branch.upstreamWithoutRemote
    ) {
      return
    }

    const urlEncodedBranchName = encodeURIComponent(
      branchTip.branch.upstreamWithoutRemote
    )

    const url = `${htmlURL}/${view}/${urlEncodedBranchName}`
    this.props.dispatcher.openInBrowser(url)
  }

  private openCurrentRepositoryWorkingDirectory() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.showRepository(state.repository)
  }

  private renameBranch() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip
    if (tip.kind === TipState.Valid) {
      this.props.dispatcher.showPopup({
        type: PopupType.RenameBranch,
        repository: state.repository,
        branch: tip.branch,
      })
    }
  }

  private deleteBranch() {
    const state = this.state.selectedState
    if (state === null || state.type !== SelectionType.Repository) {
      return
    }

    const tip = state.state.branchesState.tip

    if (tip.kind === TipState.Valid) {
      const currentPullRequest = state.state.branchesState.currentPullRequest
      if (currentPullRequest !== null) {
        this.props.dispatcher.showPopup({
          type: PopupType.DeletePullRequest,
          repository: state.repository,
          branch: tip.branch,
          pullRequest: currentPullRequest,
        })
      } else {
        const existsOnRemote = state.state.aheadBehind !== null

        this.props.dispatcher.showPopup({
          type: PopupType.DeleteBranch,
          repository: state.repository,
          branch: tip.branch,
          existsOnRemote: existsOnRemote,
        })
      }
    }
  }

  private discardAllChanges() {
    const state = this.state.selectedState

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const { workingDirectory } = state.state.changesState

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDiscardChanges,
      repository: state.repository,
      files: workingDirectory.files,
      showDiscardChangesSetting: false,
      discardingAllChanges: true,
    })
  }

  private stashAllChanges() {
    const repository = this.getRepository()

    if (repository !== null && repository instanceof Repository) {
      this.props.dispatcher.createStashForCurrentBranch(repository)
    }
  }

  private showAddLocalRepo = () => {
    return this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private showCreateRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }

  private showCloneRepo = (cloneUrl?: string) => {
    let initialURL: string | null = null

    if (cloneUrl !== undefined) {
      this.props.dispatcher.changeCloneRepositoriesTab(
        CloneRepositoryTab.Generic
      )
      initialURL = cloneUrl
    }

    return this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL,
    })
  }

  private showCreateTutorialRepositoryPopup = () => {
    const account =
      this.state.accounts.find(isDotComAccount) ?? this.state.accounts.at(0)

    if (!account) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.CreateTutorialRepository,
      account,
    })
  }

  private onResumeTutorialRepository = () => {
    const tutorialRepository = this.getSelectedTutorialRepository()
    if (!tutorialRepository) {
      return
    }

    this.props.dispatcher.resumeTutorial(tutorialRepository)
  }

  private getSelectedTutorialRepository() {
    const { selectedState } = this.state
    const selectedRepository =
      selectedState && selectedState.type === SelectionType.Repository
        ? selectedState.repository
        : null

    const isTutorialRepository =
      selectedRepository && selectedRepository.isTutorialRepository

    return isTutorialRepository ? selectedRepository : null
  }

  private showAbout() {
    this.props.dispatcher.showPopup({ type: PopupType.About })
  }

  private async showHistory(
    shouldFocusHistory: boolean,
    showBranchList: boolean = false
  ) {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    await this.props.dispatcher.closeCurrentFoldout()

    await this.props.dispatcher.initializeCompare(state.repository, {
      kind: HistoryTabMode.History,
    })

    await this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.History
    )

    await this.props.dispatcher.updateCompareForm(state.repository, {
      filterText: '',
      showBranchList,
    })

    if (shouldFocusHistory) {
      this.repositoryViewRef.current?.setFocusHistoryNeeded()
    }
  }

  private async showChanges(shouldFocusChanges: boolean) {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.closeCurrentFoldout()

    await this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Changes
    )

    if (shouldFocusChanges) {
      this.repositoryViewRef.current?.setFocusChangesNeeded()
    }
  }

  private chooseRepository() {
    if (
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Repository
    ) {
      return this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }

    return this.props.dispatcher.showFoldout({
      type: FoldoutType.Repository,
    })
  }

  private showBranches() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Branch
    ) {
      return this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    }

    return this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
  }

  private push(options?: { forceWithLease: boolean }) {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    if (options && options.forceWithLease) {
      this.props.dispatcher.confirmOrForcePush(state.repository)
    } else {
      this.props.dispatcher.push(state.repository)
    }
  }

  private async pull() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.pull(state.repository)
  }

  private async fetch() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.fetch(state.repository, FetchType.UserInitiatedTask)
  }

  private showStashedChanges() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.selectStashedFile(state.repository)
  }

  private hideStashedChanges() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.hideStashedChanges(state.repository)
  }

  public componentDidMount() {
    document.ondragover = e => {
      if (e.dataTransfer != null) {
        if (this.isShowingModal) {
          e.dataTransfer.dropEffect = 'none'
        } else {
          e.dataTransfer.dropEffect = 'copy'
        }
      }

      e.preventDefault()
    }

    document.ondrop = e => {
      e.preventDefault()
    }

    document.body.ondrop = e => {
      if (this.isShowingModal) {
        return
      }
      if (e.dataTransfer != null) {
        const files = e.dataTransfer.files
        this.handleDragAndDrop(files)
      }
      e.preventDefault()
    }

    if (shouldRenderApplicationMenu()) {
      window.addEventListener('keydown', this.onWindowKeyDown)
      window.addEventListener('keyup', this.onWindowKeyUp)
    }

    if (__DARWIN__) {
      window.addEventListener('keydown', this.onMacOSWindowKeyDown)
    }

    document.addEventListener('focus', this.onDocumentFocus, {
      capture: true,
    })
  }

  private onDocumentFocus = (event: FocusEvent) => {
    this.props.dispatcher.appFocusedElementChanged()
  }

  /**
   * Manages keyboard shortcuts specific to macOS.
   * - adds Shift+F10 to open the context menus (like on Windows so macOS
   *   keyboard users are not required to use VoiceOver to trigger context
   *   menus)
   */
  private onMacOSWindowKeyDown = (event: KeyboardEvent) => {
    // We do not want to override Shift+F10 behavior for the context menu on Windows.
    if (!__DARWIN__) {
      return
    }

    if (event.defaultPrevented) {
      return
    }

    if (event.shiftKey && event.key === 'F10') {
      document.activeElement?.dispatchEvent(
        new Event('contextmenu', {
          bubbles: true, // Required for React's event system
        })
      )
    }
  }

  /**
   * On Windows pressing the Alt key and holding it down should
   * highlight the application menu.
   *
   * This method in conjunction with the onWindowKeyUp sets the
   * appMenuToolbarHighlight state when the Alt key (and only the
   * Alt key) is pressed.
   */
  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (this.isShowingModal) {
      return
    }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Shift' && event.altKey) {
        this.props.dispatcher.setAccessKeyHighlightState(false)
      } else if (event.key === 'Alt') {
        if (event.shiftKey) {
          return
        }
        // Immediately close the menu if open and the user hits Alt. This is
        // a Windows convention.
        if (
          this.state.currentFoldout &&
          this.state.currentFoldout.type === FoldoutType.AppMenu
        ) {
          // Only close it the menu when the key is pressed if there's an open
          // menu. If there isn't we should close it when the key is released
          // instead and that's taken care of in the onWindowKeyUp function.
          if (this.state.appMenuState.length > 1) {
            this.props.dispatcher.setAppMenuState(menu => menu.withReset())
            this.props.dispatcher.closeFoldout(FoldoutType.AppMenu)
          }
        }

        this.props.dispatcher.setAccessKeyHighlightState(true)
      } else if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (this.state.appMenuState.length) {
          const candidates = this.state.appMenuState[0].items
          const menuItemForAccessKey = findItemByAccessKey(
            event.key,
            candidates
          )

          if (menuItemForAccessKey && itemIsSelectable(menuItemForAccessKey)) {
            if (menuItemForAccessKey.type === 'submenuItem') {
              this.props.dispatcher.setAppMenuState(menu =>
                menu
                  .withReset()
                  .withSelectedItem(menuItemForAccessKey)
                  .withOpenedMenu(menuItemForAccessKey, true)
              )

              this.props.dispatcher.showFoldout({
                type: FoldoutType.AppMenu,
                enableAccessKeyNavigation: true,
              })
            } else {
              this.props.dispatcher.executeMenuItem(menuItemForAccessKey)
            }

            event.preventDefault()
          }
        }
      } else if (!event.altKey) {
        this.props.dispatcher.setAccessKeyHighlightState(false)
      }
    }

    this.lastKeyPressed = event.key
  }

  /**
   * Open the application menu foldout when the Alt key is pressed.
   *
   * See onWindowKeyDown for more information.
   */
  private onWindowKeyUp = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Alt') {
        this.props.dispatcher.setAccessKeyHighlightState(false)

        if (this.lastKeyPressed === 'Alt') {
          if (
            this.state.currentFoldout &&
            this.state.currentFoldout.type === FoldoutType.AppMenu
          ) {
            this.props.dispatcher.setAppMenuState(menu => menu.withReset())
            this.props.dispatcher.closeFoldout(FoldoutType.AppMenu)
          } else {
            this.props.dispatcher.showFoldout({
              type: FoldoutType.AppMenu,
              enableAccessKeyNavigation: true,
            })
          }
        }
      }
    }
  }

  private async handleDragAndDrop(fileList: FileList) {
    const paths = Array.from(fileList, webUtils.getPathForFile)
    const { dispatcher } = this.props

    // If they're bulk adding repositories then just blindly try to add them.
    // But if they just dragged one, use the dialog so that they can initialize
    // it if needed.
    if (paths.length > 1) {
      const addedRepositories = await dispatcher.addRepositories(paths)

      if (addedRepositories.length > 0) {
        dispatcher.recordAddExistingRepository()
        await dispatcher.selectRepository(addedRepositories[0])
      }
    } else if (paths.length === 1) {
      // user may accidentally provide a folder within the repository
      // this ensures we use the repository root, if it is actually a repository
      // otherwise we consider it an untracked repository
      const path = await getRepositoryType(paths[0])
        .then(t =>
          t.kind === 'regular' ? t.topLevelWorkingDirectory : paths[0]
        )
        .catch(e => {
          log.error('Could not determine repository type', e)
          return paths[0]
        })

      const { repositories } = this.state
      const existingRepository = matchExistingRepository(repositories, path)

      if (existingRepository) {
        await dispatcher.selectRepository(existingRepository)
      } else {
        await this.showPopup({ type: PopupType.AddRepository, path })
      }
    }
  }

  private removeRepository = (
    repository: Repository | CloningRepository | null
  ) => {
    if (!repository) {
      return
    }

    if (repository instanceof CloningRepository || repository.missing) {
      this.props.dispatcher.removeRepository(repository, false)
      return
    }

    if (this.state.askForConfirmationOnRepositoryRemoval) {
      this.props.dispatcher.showPopup({
        type: PopupType.RemoveRepository,
        repository,
      })
    } else {
      this.props.dispatcher.removeRepository(repository, false)
    }
  }

  private onConfirmRepoRemoval = async (
    repository: Repository,
    deleteRepoFromDisk: boolean
  ) => {
    await this.props.dispatcher.removeRepository(repository, deleteRepoFromDisk)
  }

  private getRepository(): Repository | CloningRepository | null {
    const state = this.state.selectedState
    if (state == null) {
      return null
    }

    return state.repository
  }

  private showRebaseDialog() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }

    this.props.dispatcher.showRebaseDialog(repository)
  }

  private showRepositorySettings() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }
    this.props.dispatcher.showPopup({
      type: PopupType.RepositorySettings,
      repository,
    })
  }

  /**
   * Opens a browser to the issue creation page
   * of the current GitHub repository.
   */
  private openIssueCreationOnGitHub() {
    const repository = this.getRepository()
    // this will likely never be null since we disable the
    // issue creation menu item for non-GitHub repositories
    if (repository instanceof Repository) {
      this.props.dispatcher.openIssueCreationPage(repository)
    }
  }

  private viewRepositoryOnGitHub() {
    const repository = this.getRepository()

    this.viewOnGitHub(repository)
  }

  /** Returns the URL to the current repository if hosted on GitHub */
  private getCurrentRepositoryGitHubURL() {
    const repository = this.getRepository()

    if (
      !repository ||
      repository instanceof CloningRepository ||
      !repository.gitHubRepository
    ) {
      return null
    }

    return repository.gitHubRepository.htmlURL
  }

  private openCurrentRepositoryInShell = () => {
    const repository = this.getRepository()
    if (!repository) {
      return
    }

    this.openInShell(repository)
  }

  /**
   * Gets a label string for the currently selected external editor, or
   * `undefined` if the user has selected a custom editor.
   */
  private get externalEditorLabel() {
    return this.state.useCustomEditor
      ? undefined
      : this.state.selectedExternalEditor ?? undefined
  }

  private openCurrentRepositoryInExternalEditor() {
    const repository = this.getRepository()
    if (!repository) {
      return
    }

    this.openInExternalEditor(repository)
  }

  /**
   * Conditionally renders a menu bar. The menu bar is currently only rendered
   * on Windows.
   */
  private renderAppMenuBar() {
    // We only render the app menu bar on Windows
    if (!__WIN32__) {
      return null
    }

    // Have we received an app menu from the main process yet?
    if (!this.state.appMenuState.length) {
      return null
    }

    // Don't render the menu bar during the welcome flow
    if (this.state.showWelcomeFlow) {
      return null
    }

    const currentFoldout = this.state.currentFoldout

    // AppMenuBar requires us to pass a strongly typed AppMenuFoldout state or
    // null if the AppMenu foldout is not currently active.
    const foldoutState =
      currentFoldout && currentFoldout.type === FoldoutType.AppMenu
        ? currentFoldout
        : null

    return (
      <AppMenuBar
        appMenu={this.state.appMenuState}
        dispatcher={this.props.dispatcher}
        highlightAppMenuAccessKeys={this.state.highlightAccessKeys}
        foldoutState={foldoutState}
        onLostFocus={this.onMenuBarLostFocus}
      />
    )
  }

  private onMenuBarLostFocus = () => {
    // Note: This event is emitted in an animation frame separate from
    // that of the AppStore. See onLostFocusWithin inside of the AppMenuBar
    // for more details. This means that it's possible that the current
    // app state in this component's state might be out of date so take
    // caution when considering app state in this method.
    this.props.dispatcher.closeFoldout(FoldoutType.AppMenu)
    this.props.dispatcher.setAppMenuState(menu => menu.withReset())
  }

  private renderTitlebar() {
    const inFullScreen = this.state.windowState === 'full-screen'

    const menuBarActive =
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.AppMenu

    // As Linux still uses the classic Electron menu, we are opting out of the
    // custom menu that is shown as part of the title bar below
    if (__LINUX__) {
      return null
    }

    // When we're in full-screen mode on Windows we only need to render
    // the title bar when the menu bar is active. On other platforms we
    // never render the title bar while in full-screen mode.
    if (inFullScreen) {
      if (!__WIN32__ || !menuBarActive) {
        return null
      }
    }

    const showAppIcon = __WIN32__ && !this.state.showWelcomeFlow
    const inWelcomeFlow = this.state.showWelcomeFlow
    const inNoRepositoriesView = this.inNoRepositoriesViewState()

    // The light title bar style should only be used while we're in
    // the welcome flow as well as the no-repositories blank slate
    // on macOS. The latter case has to do with the application menu
    // being part of the title bar on Windows. We need to render
    // the app menu in the no-repositories blank slate on Windows but
    // the menu doesn't support the light style at the moment so we're
    // forcing it to use the dark style.
    const titleBarStyle =
      inWelcomeFlow || (__DARWIN__ && inNoRepositoriesView) ? 'light' : 'dark'

    return (
      <TitleBar
        showAppIcon={showAppIcon}
        titleBarStyle={titleBarStyle}
        windowState={this.state.windowState}
        windowZoomFactor={this.state.windowZoomFactor}
      >
        {this.renderAppMenuBar()}
      </TitleBar>
    )
  }

  private onPopupDismissed = (popupId: string) => {
    return this.props.dispatcher.closePopupById(popupId)
  }

  private onContinueWithUntrustedCertificate = (
    certificate: Electron.Certificate
  ) => {
    showCertificateTrustDialog(
      certificate,
      'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.'
    )
  }

  private onUpdateAvailableDismissed = () =>
    this.props.dispatcher.setUpdateBannerVisibility(false)

  private allPopupContent(): JSX.Element | null {
    const { allPopups } = this.state

    if (allPopups.length === 0) {
      return null
    }

    return (
      <>
        {allPopups.map(popup => {
          const isTopMost = this.state.currentPopup?.id === popup.id
          return (
            <DialogStackContext.Provider key={popup.id} value={{ isTopMost }}>
              {this.popupContent(popup, isTopMost)}
            </DialogStackContext.Provider>
          )
        })}
      </>
    )
  }

  private popupContent(popup: Popup, isTopMost: boolean): JSX.Element | null {
    if (popup.id === undefined) {
      // Should not be possible... but if it does we want to know about it.
      sendNonFatalException(
        'PopupNoId',
        new Error(
          `Attempted to open a popup of type '${popup.type}' without an Id`
        )
      )
      return null
    }

    const onPopupDismissedFn = this.getOnPopupDismissedFn(popup.id)

    switch (popup.type) {
      case PopupType.RenameBranch:
        return (
          <RenameBranch
            key="rename-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.DeleteBranch:
        return (
          <DeleteBranch
            key="delete-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            existsOnRemote={popup.existsOnRemote}
            onDismissed={onPopupDismissedFn}
            onDeleted={this.onBranchDeleted}
          />
        )
      case PopupType.DeleteRemoteBranch:
        return (
          <DeleteRemoteBranch
            key="delete-remote-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={onPopupDismissedFn}
            onDeleted={this.onBranchDeleted}
          />
        )
      case PopupType.ConfirmDiscardChanges:
        const showSetting =
          popup.showDiscardChangesSetting === undefined
            ? true
            : popup.showDiscardChangesSetting
        const discardingAllChanges =
          popup.discardingAllChanges === undefined
            ? false
            : popup.discardingAllChanges

        return (
          <DiscardChanges
            key="discard-changes"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            files={popup.files}
            confirmDiscardChanges={
              this.state.askForConfirmationOnDiscardChanges
            }
            showDiscardChangesSetting={showSetting}
            discardingAllChanges={discardingAllChanges}
            onDismissed={onPopupDismissedFn}
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
          />
        )
      case PopupType.ConfirmDiscardSelection:
        return (
          <DiscardSelection
            key="discard-selection"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            file={popup.file}
            diff={popup.diff}
            selection={popup.selection}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.Preferences:
        let repository = this.getRepository()

        if (repository instanceof CloningRepository) {
          repository = null
        }

        return (
          <Preferences
            key="preferences"
            initialSelectedTab={popup.initialSelectedTab}
            dispatcher={this.props.dispatcher}
            accounts={this.state.accounts}
            confirmRepositoryRemoval={
              this.state.askForConfirmationOnRepositoryRemoval
            }
            confirmDiscardChanges={
              this.state.askForConfirmationOnDiscardChanges
            }
            confirmDiscardChangesPermanently={
              this.state.askForConfirmationOnDiscardChangesPermanently
            }
            confirmDiscardStash={this.state.askForConfirmationOnDiscardStash}
            confirmCheckoutCommit={
              this.state.askForConfirmationOnCheckoutCommit
            }
            confirmForcePush={this.state.askForConfirmationOnForcePush}
            confirmUndoCommit={this.state.askForConfirmationOnUndoCommit}
            askForConfirmationOnCommitFilteredChanges={
              this.state.askForConfirmationOnCommitFilteredChanges
            }
            confirmCommitMessageOverride={
              this.state.askForConfirmationOnCommitMessageOverride
            }
            uncommittedChangesStrategy={this.state.uncommittedChangesStrategy}
            selectedExternalEditor={this.state.selectedExternalEditor}
            useWindowsOpenSSH={this.state.useWindowsOpenSSH}
            showCommitLengthWarning={this.state.showCommitLengthWarning}
            notificationsEnabled={this.state.notificationsEnabled}
            optOutOfUsageTracking={this.state.optOutOfUsageTracking}
            useExternalCredentialHelper={this.state.useExternalCredentialHelper}
            repository={repository}
            onDismissed={onPopupDismissedFn}
            selectedShell={this.state.selectedShell}
            selectedTheme={this.state.selectedTheme}
            selectedTabSize={this.state.selectedTabSize}
            editorSettings={this.state.editorSettings}
            useCustomEditor={this.state.useCustomEditor}
            customEditor={this.state.customEditor}
            useCustomShell={this.state.useCustomShell}
            customShell={this.state.customShell}
            repositoryIndicatorsEnabled={this.state.repositoryIndicatorsEnabled}
            onEditGlobalGitConfig={this.editGlobalGitConfig}
            underlineLinks={this.state.underlineLinks}
            showDiffCheckMarks={this.state.showDiffCheckMarks}
          />
        )
      case PopupType.RepositorySettings: {
        const repository = popup.repository
        const state = this.props.repositoryStateManager.get(repository)
        const repositoryAccount = getAccountForRepository(
          this.state.accounts,
          repository
        )

        return (
          <RepositorySettings
            key={`repository-settings-${repository.hash}`}
            initialSelectedTab={popup.initialSelectedTab}
            remote={state.remote}
            dispatcher={this.props.dispatcher}
            repository={repository}
            repositoryAccount={repositoryAccount}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SignIn:
        return (
          <SignIn
            key="sign-in"
            signInState={this.state.signInState}
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
            isCredentialHelperSignIn={popup.isCredentialHelperSignIn}
            credentialHelperUrl={popup.credentialHelperUrl}
          />
        )
      case PopupType.AddRepository:
        return (
          <AddExistingRepository
            key="add-existing-repository"
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            path={popup.path}
          />
        )
      case PopupType.CreateRepository:
        return (
          <CreateRepository
            key="create-repository"
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            initialPath={popup.path}
            isTopMost={isTopMost}
          />
        )
      case PopupType.CloneRepository:
        return (
          <CloneRepository
            key="clone-repository"
            accounts={this.state.accounts}
            initialURL={popup.initialURL}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            selectedTab={this.state.selectedCloneRepositoryTab}
            onTabSelected={this.onCloneRepositoriesTabSelected}
            apiRepositories={this.state.apiRepositories}
            onRefreshRepositories={this.onRefreshRepositories}
            isTopMost={isTopMost}
          />
        )
      case PopupType.CreateBranch: {
        const state = this.props.repositoryStateManager.get(popup.repository)
        const branchesState = state.branchesState
        const repository = popup.repository

        if (branchesState.tip.kind === TipState.Unknown) {
          onPopupDismissedFn()
          return null
        }

        let upstreamGhRepo: GitHubRepository | null = null
        let upstreamDefaultBranch: Branch | null = null

        if (isRepositoryWithGitHubRepository(repository)) {
          upstreamGhRepo = getNonForkGitHubRepository(repository)
          upstreamDefaultBranch = branchesState.upstreamDefaultBranch
        }

        return (
          <CreateBranch
            key="create-branch"
            tip={branchesState.tip}
            defaultBranch={branchesState.defaultBranch}
            upstreamDefaultBranch={upstreamDefaultBranch}
            allBranches={branchesState.allBranches}
            repository={repository}
            targetCommit={popup.targetCommit}
            upstreamGitHubRepository={upstreamGhRepo}
            accounts={this.state.accounts}
            cachedRepoRulesets={this.state.cachedRepoRulesets}
            onBranchCreatedFromCommit={this.onBranchCreatedFromCommit}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            initialName={popup.initialName || ''}
          />
        )
      }
      case PopupType.InstallGit:
        return (
          <InstallGit
            key="install-git"
            onDismissed={onPopupDismissedFn}
            onOpenShell={this.onOpenShellIgnoreWarning}
            path={popup.path}
          />
        )
      case PopupType.About:
        const version = __DEV__ ? __SHA__.substring(0, 10) : getVersion()

        return (
          <About
            key="about"
            onDismissed={onPopupDismissedFn}
            applicationName={getName()}
            applicationVersion={version}
            applicationArchitecture={process.arch}
            onCheckForNonStaggeredUpdates={this.onCheckForNonStaggeredUpdates}
            onShowAcknowledgements={this.showAcknowledgements}
            onShowTermsAndConditions={this.showTermsAndConditions}
            updateState={this.state.updateState}
            onQuitAndInstall={this.onQuitAndInstall}
          />
        )
      case PopupType.PublishRepository:
        return (
          <Publish
            key="publish"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            accounts={this.state.accounts}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.UntrustedCertificate:
        return (
          <UntrustedCertificate
            key="untrusted-certificate"
            certificate={popup.certificate}
            url={popup.url}
            onDismissed={onPopupDismissedFn}
            onContinue={this.onContinueWithUntrustedCertificate}
          />
        )
      case PopupType.Acknowledgements:
        return (
          <Acknowledgements
            key="acknowledgements"
            onDismissed={onPopupDismissedFn}
            applicationVersion={getVersion()}
          />
        )
      case PopupType.RemoveRepository:
        return (
          <ConfirmRemoveRepository
            key="confirm-remove-repository"
            repository={popup.repository}
            onConfirmation={this.onConfirmRepoRemoval}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.TermsAndConditions:
        return (
          <TermsAndConditions
            key="terms-and-conditions"
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.PushBranchCommits:
        return (
          <PushBranchCommits
            key="push-branch-commits"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            unPushedCommits={popup.unPushedCommits}
            onConfirm={this.openCreatePullRequestInBrowser}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.CLIInstalled:
        return (
          <CLIInstalled key="cli-installed" onDismissed={onPopupDismissedFn} />
        )
      case PopupType.GenericGitAuthentication:
        const onDismiss = () => {
          popup.onDismiss?.()
          onPopupDismissedFn()
        }

        return (
          <GenericGitAuthentication
            key="generic-git-authentication"
            remoteUrl={popup.remoteUrl}
            username={popup.username}
            // eslint-disable-next-line react/jsx-no-bind
            onDismiss={onDismiss}
            onSave={popup.onSubmit}
          />
        )
      case PopupType.ExternalEditorFailed:
        const openPreferences = popup.openPreferences
        const suggestDefaultEditor = popup.suggestDefaultEditor

        return (
          <EditorError
            key="editor-error"
            message={popup.message}
            onDismissed={onPopupDismissedFn}
            showPreferencesDialog={this.onShowIntegrationsPreferences}
            viewPreferences={openPreferences}
            suggestDefaultEditor={suggestDefaultEditor}
          />
        )
      case PopupType.OpenShellFailed:
        return (
          <ShellError
            key="shell-error"
            message={popup.message}
            onDismissed={onPopupDismissedFn}
            showPreferencesDialog={this.onShowIntegrationsPreferences}
          />
        )
      case PopupType.InitializeLFS:
        return (
          <InitializeLFS
            key="initialize-lfs"
            repositories={popup.repositories}
            onDismissed={onPopupDismissedFn}
            onInitialize={this.initializeLFS}
          />
        )
      case PopupType.LFSAttributeMismatch:
        return (
          <AttributeMismatch
            key="lsf-attribute-mismatch"
            onDismissed={onPopupDismissedFn}
            onUpdateExistingFilters={this.updateExistingLFSFilters}
            onEditGlobalGitConfig={this.editGlobalGitConfig}
          />
        )
      case PopupType.UpstreamAlreadyExists:
        return (
          <UpstreamAlreadyExists
            key="upstream-already-exists"
            repository={popup.repository}
            existingRemote={popup.existingRemote}
            onDismissed={onPopupDismissedFn}
            onUpdate={this.onUpdateExistingUpstreamRemote}
            onIgnore={this.onIgnoreExistingUpstreamRemote}
          />
        )
      case PopupType.ReleaseNotes:
        return (
          <ReleaseNotes
            key="release-notes"
            emoji={this.state.emoji}
            newReleases={popup.newReleases}
            onDismissed={onPopupDismissedFn}
            underlineLinks={this.state.underlineLinks}
          />
        )
      case PopupType.DeletePullRequest:
        return (
          <DeletePullRequest
            key="delete-pull-request"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={onPopupDismissedFn}
            pullRequest={popup.pullRequest}
          />
        )
      case PopupType.OversizedFiles:
        return (
          <OversizedFiles
            key="oversized-files"
            oversizedFiles={popup.oversizedFiles}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            context={popup.context}
            repository={popup.repository}
          />
        )
      case PopupType.CommitConflictsWarning:
        return (
          <CommitConflictsWarning
            key="commit-conflicts-warning"
            dispatcher={this.props.dispatcher}
            files={popup.files}
            repository={popup.repository}
            context={popup.context}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.PushNeedsPull:
        return (
          <PushNeedsPullWarning
            key="push-needs-pull"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.ConfirmForcePush: {
        const { askForConfirmationOnForcePush } = this.state

        return (
          <ConfirmForcePush
            key="confirm-force-push"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            upstreamBranch={popup.upstreamBranch}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.StashAndSwitchBranch: {
        const { repository, branchToCheckout } = popup
        const { branchesState, changesState } =
          this.props.repositoryStateManager.get(repository)
        const { tip } = branchesState

        if (tip.kind !== TipState.Valid) {
          return null
        }

        const currentBranch = tip.branch
        const hasAssociatedStash = changesState.stashEntry !== null

        return (
          <StashAndSwitchBranch
            key="stash-and-switch-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            currentBranch={currentBranch}
            branchToCheckout={branchToCheckout}
            hasAssociatedStash={hasAssociatedStash}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmOverwriteStash: {
        const { repository, branchToCheckout: branchToCheckout } = popup
        return (
          <OverwriteStash
            key="overwrite-stash"
            dispatcher={this.props.dispatcher}
            repository={repository}
            branchToCheckout={branchToCheckout}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmDiscardStash: {
        const { repository, stash } = popup

        return (
          <ConfirmDiscardStashDialog
            key="confirm-discard-stash-dialog"
            dispatcher={this.props.dispatcher}
            askForConfirmationOnDiscardStash={
              this.state.askForConfirmationOnDiscardStash
            }
            repository={repository}
            stash={stash}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmCheckoutCommit: {
        const { repository, commit } = popup

        return (
          <ConfirmCheckoutCommitDialog
            key="confirm-checkout-commit-dialog"
            dispatcher={this.props.dispatcher}
            askForConfirmationOnCheckoutCommit={
              this.state.askForConfirmationOnDiscardStash
            }
            repository={repository}
            commit={commit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.CreateTutorialRepository: {
        return (
          <CreateTutorialRepositoryDialog
            key="create-tutorial-repository-dialog"
            account={popup.account}
            progress={popup.progress}
            onDismissed={onPopupDismissedFn}
            onCreateTutorialRepository={this.onCreateTutorialRepository}
          />
        )
      }
      case PopupType.ConfirmExitTutorial: {
        return (
          <ConfirmExitTutorial
            key="confirm-exit-tutorial"
            onDismissed={onPopupDismissedFn}
            onContinue={this.onExitTutorialToHomeScreen}
          />
        )
      }
      case PopupType.PushRejectedDueToMissingWorkflowScope:
        return (
          <WorkflowPushRejectedDialog
            onDismissed={onPopupDismissedFn}
            rejectedPath={popup.rejectedPath}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
          />
        )
      case PopupType.SAMLReauthRequired:
        return (
          <SAMLReauthRequiredDialog
            onDismissed={onPopupDismissedFn}
            organizationName={popup.organizationName}
            endpoint={popup.endpoint}
            retryAction={popup.retryAction}
            dispatcher={this.props.dispatcher}
          />
        )
      case PopupType.CreateFork:
        return (
          <CreateForkDialog
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            account={popup.account}
          />
        )
      case PopupType.CreateTag: {
        return (
          <CreateTag
            key="create-tag"
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            targetCommitSha={popup.targetCommitSha}
            initialName={popup.initialName}
            localTags={popup.localTags}
          />
        )
      }
      case PopupType.DeleteTag: {
        return (
          <DeleteTag
            key="delete-tag"
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
            tagName={popup.tagName}
          />
        )
      }
      case PopupType.ChooseForkSettings: {
        return (
          <ChooseForkSettings
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
            dispatcher={this.props.dispatcher}
          />
        )
      }
      case PopupType.LocalChangesOverwritten:
        const selectedState = this.state.selectedState

        const existingStash =
          selectedState !== null &&
          selectedState.type === SelectionType.Repository
            ? selectedState.state.changesState.stashEntry
            : null

        return (
          <LocalChangesOverwrittenDialog
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            hasExistingStash={existingStash !== null}
            retryAction={popup.retryAction}
            onDismissed={onPopupDismissedFn}
            files={popup.files}
          />
        )
      case PopupType.MoveToApplicationsFolder: {
        return (
          <MoveToApplicationsFolder
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ChangeRepositoryAlias: {
        return (
          <ChangeRepositoryAlias
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ThankYou:
        return (
          <ThankYou
            key="thank-you"
            emoji={this.state.emoji}
            userContributions={popup.userContributions}
            friendlyName={popup.friendlyName}
            latestVersion={popup.latestVersion}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.CommitMessage:
        const repositoryState = this.props.repositoryStateManager.get(
          popup.repository
        )

        const { tip } = repositoryState.branchesState
        const currentBranchName: string | null =
          tip.kind === TipState.Valid ? tip.branch.name : null

        const hasWritePermissionForRepository =
          popup.repository.gitHubRepository === null ||
          hasWritePermission(popup.repository.gitHubRepository)

        const autocompletionProviders = buildAutocompletionProviders(
          popup.repository,
          this.props.dispatcher,
          this.state.emoji,
          this.props.issuesStore,
          this.props.gitHubUserStore,
          this.state.accounts
        )

        const repositoryAccount = getAccountForRepository(
          this.state.accounts,
          popup.repository
        )

        return (
          <CommitMessageDialog
            key="commit-message"
            autocompletionProviders={autocompletionProviders}
            branch={currentBranchName}
            coAuthors={popup.coAuthors}
            commitAuthor={repositoryState.commitAuthor}
            commitMessage={popup.commitMessage}
            commitSpellcheckEnabled={this.state.commitSpellcheckEnabled}
            showCommitLengthWarning={this.state.showCommitLengthWarning}
            dialogButtonText={popup.dialogButtonText}
            dialogTitle={popup.dialogTitle}
            dispatcher={this.props.dispatcher}
            prepopulateCommitSummary={popup.prepopulateCommitSummary}
            repository={popup.repository}
            showBranchProtected={
              repositoryState.changesState.currentBranchProtected
            }
            repoRulesInfo={repositoryState.changesState.currentRepoRulesInfo}
            aheadBehind={repositoryState.aheadBehind}
            showCoAuthoredBy={popup.showCoAuthoredBy}
            showNoWriteAccess={!hasWritePermissionForRepository}
            onDismissed={onPopupDismissedFn}
            onSubmitCommitMessage={popup.onSubmitCommitMessage}
            repositoryAccount={repositoryAccount}
            accounts={this.state.accounts}
          />
        )
      case PopupType.MultiCommitOperation: {
        const { selectedState, emoji } = this.state

        if (
          selectedState === null ||
          selectedState.type !== SelectionType.Repository
        ) {
          return null
        }

        const { changesState, multiCommitOperationState } = selectedState.state
        const { workingDirectory, conflictState } = changesState
        if (multiCommitOperationState === null) {
          log.warn(
            '[App] invalid state encountered - multi commit flow should not be active when step is null'
          )
          return null
        }

        return (
          <MultiCommitOperation
            key="multi-commit-operation"
            repository={popup.repository}
            dispatcher={this.props.dispatcher}
            state={multiCommitOperationState}
            conflictState={conflictState}
            emoji={emoji}
            workingDirectory={workingDirectory}
            askForConfirmationOnForcePush={
              this.state.askForConfirmationOnForcePush
            }
            accounts={this.state.accounts}
            cachedRepoRulesets={this.state.cachedRepoRulesets}
            openFileInExternalEditor={this.openFileInExternalEditor}
            resolvedExternalEditor={this.state.resolvedExternalEditor}
            openRepositoryInShell={this.openCurrentRepositoryInShell}
          />
        )
      }
      case PopupType.WarnLocalChangesBeforeUndo: {
        const { repository, commit, isWorkingDirectoryClean } = popup
        return (
          <WarnLocalChangesBeforeUndo
            key="warn-local-changes-before-undo"
            dispatcher={this.props.dispatcher}
            repository={repository}
            commit={commit}
            isWorkingDirectoryClean={isWorkingDirectoryClean}
            confirmUndoCommit={this.state.askForConfirmationOnUndoCommit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.WarningBeforeReset: {
        const { repository, commit } = popup
        return (
          <WarningBeforeReset
            key="warning-before-reset"
            dispatcher={this.props.dispatcher}
            repository={repository}
            commit={commit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.InvalidatedToken: {
        return (
          <InvalidatedToken
            key="invalidated-token"
            dispatcher={this.props.dispatcher}
            account={popup.account}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.AddSSHHost: {
        return (
          <AddSSHHost
            key="add-ssh-host"
            host={popup.host}
            ip={popup.ip}
            keyType={popup.keyType}
            fingerprint={popup.fingerprint}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SSHKeyPassphrase: {
        return (
          <SSHKeyPassphrase
            key="ssh-key-passphrase"
            keyPath={popup.keyPath}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.SSHUserPassword: {
        return (
          <SSHUserPassword
            key="ssh-user-password"
            username={popup.username}
            onSubmit={popup.onSubmit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.PullRequestChecksFailed: {
        return (
          <PullRequestChecksFailed
            key="pull-request-checks-failed"
            dispatcher={this.props.dispatcher}
            shouldChangeRepository={popup.shouldChangeRepository}
            repository={popup.repository}
            pullRequest={popup.pullRequest}
            checks={popup.checks}
            accounts={this.state.accounts}
            onSubmit={onPopupDismissedFn}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.CICheckRunRerun: {
        return (
          <CICheckRunRerunDialog
            key="rerun-check-runs"
            checkRuns={popup.checkRuns}
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            prRef={popup.prRef}
            onDismissed={onPopupDismissedFn}
            failedOnly={popup.failedOnly}
          />
        )
      }
      case PopupType.WarnForcePush: {
        const { askForConfirmationOnForcePush } = this.state
        return (
          <WarnForcePushDialog
            key="warn-force-push"
            dispatcher={this.props.dispatcher}
            operation={popup.operation}
            askForConfirmationOnForcePush={askForConfirmationOnForcePush}
            onBegin={this.getWarnForcePushDialogOnBegin(
              popup.onBegin,
              onPopupDismissedFn
            )}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.DiscardChangesRetry: {
        return (
          <DiscardChangesRetryDialog
            key="discard-changes-retry"
            dispatcher={this.props.dispatcher}
            retryAction={popup.retryAction}
            onDismissed={onPopupDismissedFn}
            onConfirmDiscardChangesChanged={
              this.onConfirmDiscardChangesPermanentlyChanged
            }
          />
        )
      }
      case PopupType.PullRequestReview: {
        return (
          <PullRequestReview
            key="pull-request-review"
            dispatcher={this.props.dispatcher}
            shouldCheckoutBranch={popup.shouldCheckoutBranch}
            shouldChangeRepository={popup.shouldChangeRepository}
            repository={popup.repository}
            pullRequest={popup.pullRequest}
            review={popup.review}
            emoji={this.state.emoji}
            onSubmit={onPopupDismissedFn}
            onDismissed={onPopupDismissedFn}
            underlineLinks={this.state.underlineLinks}
            accounts={this.state.accounts}
          />
        )
      }
      case PopupType.UnreachableCommits: {
        const { selectedState, emoji } = this.state
        if (
          selectedState == null ||
          selectedState.type !== SelectionType.Repository
        ) {
          return null
        }

        const {
          commitLookup,
          commitSelection: { shas, shasInDiff },
        } = selectedState.state

        return (
          <UnreachableCommitsDialog
            selectedShas={shas}
            shasInDiff={shasInDiff}
            commitLookup={commitLookup}
            selectedTab={popup.selectedTab}
            emoji={emoji}
            onDismissed={onPopupDismissedFn}
            accounts={this.state.accounts}
          />
        )
      }
      case PopupType.StartPullRequest: {
        // Intentionally chose to get the current pull request state  on
        // rerender because state variables such as file selection change
        // via the dispatcher.
        const pullRequestState = this.getPullRequestState()
        if (pullRequestState === null) {
          // This shouldn't happen..
          sendNonFatalException(
            'FailedToStartPullRequest',
            new Error(
              'Failed to start pull request because pull request state was null'
            )
          )
          return null
        }

        const { pullRequestFilesListWidth, hideWhitespaceInPullRequestDiff } =
          this.state

        const {
          prBaseBranches,
          currentBranch,
          defaultBranch,
          imageDiffType,
          externalEditorLabel,
          nonLocalCommitSHA,
          prRecentBaseBranches,
          repository,
          showSideBySideDiff,
          currentBranchHasPullRequest,
        } = popup

        return (
          <OpenPullRequestDialog
            key="open-pull-request"
            prBaseBranches={prBaseBranches}
            currentBranch={currentBranch}
            defaultBranch={defaultBranch}
            dispatcher={this.props.dispatcher}
            fileListWidth={pullRequestFilesListWidth}
            hideWhitespaceInDiff={hideWhitespaceInPullRequestDiff}
            imageDiffType={imageDiffType}
            nonLocalCommitSHA={nonLocalCommitSHA}
            pullRequestState={pullRequestState}
            prRecentBaseBranches={prRecentBaseBranches}
            repository={repository}
            externalEditorLabel={externalEditorLabel}
            showSideBySideDiff={showSideBySideDiff}
            currentBranchHasPullRequest={currentBranchHasPullRequest}
            onDismissed={onPopupDismissedFn}
            onOpenInExternalEditor={this.onOpenInExternalEditor}
          />
        )
      }
      case PopupType.Error: {
        return (
          <AppError
            error={popup.error}
            onDismissed={onPopupDismissedFn}
            onShowPopup={this.showPopup}
            onRetryAction={this.onRetryAction}
          />
        )
      }
      case PopupType.InstallingUpdate: {
        return (
          <InstallingUpdate
            key="installing-update"
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.TestNotifications: {
        return (
          <TestNotifications
            key="test-notifications"
            dispatcher={this.props.dispatcher}
            notificationsDebugStore={this.props.notificationsDebugStore}
            repository={popup.repository}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.PullRequestComment: {
        return (
          <PullRequestComment
            key="pull-request-comment"
            dispatcher={this.props.dispatcher}
            shouldCheckoutBranch={popup.shouldCheckoutBranch}
            shouldChangeRepository={popup.shouldChangeRepository}
            repository={popup.repository}
            pullRequest={popup.pullRequest}
            comment={popup.comment}
            emoji={this.state.emoji}
            onSubmit={onPopupDismissedFn}
            onDismissed={onPopupDismissedFn}
            underlineLinks={this.state.underlineLinks}
            accounts={this.state.accounts}
          />
        )
      }
      case PopupType.UnknownAuthors: {
        return (
          <UnknownAuthors
            key="unknown-authors"
            authors={popup.authors}
            onCommit={popup.onCommit}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.TestIcons: {
        return (
          <IconPreviewDialog
            key="octicons-preview"
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.ConfirmCommitFilteredChanges: {
        return (
          <ConfirmCommitFilteredChanges
            onCommitAnyway={popup.onCommitAnyway}
            onDismissed={onPopupDismissedFn}
            showFilesToBeCommitted={popup.showFilesToBeCommitted}
            setConfirmCommitFilteredChanges={
              this.setConfirmCommitFilteredChanges
            }
          />
        )
      }
      case PopupType.TestAbout:
        return (
          <AboutTestDialog
            key="about"
            onDismissed={onPopupDismissedFn}
            onShowAcknowledgements={this.showAcknowledgements}
            onShowTermsAndConditions={this.showTermsAndConditions}
          />
        )
      case PopupType.PushProtectionError:
        return (
          <PushProtectionErrorDialog
            key="push-protection-error"
            secrets={popup.secrets}
            onDelegatedBypassLinkClick={this.onSecretDelegatedBypassLinkClick}
            onRemediationInstructionsLinkClick={
              this.onSecretRemediationInstructionsLinkClick
            }
            bypassPushProtection={this.openBypassPushProtection}
            onDismissed={onPopupDismissedFn}
          />
        )
      case PopupType.BypassPushProtection:
        return (
          <BypassPushProtectionDialog
            key="bypass-push-protection"
            secret={popup.secret}
            bypassPushProtection={popup.bypassPushProtection}
            onDismissed={this.onDismissBypassPushProtection(
              popup.id,
              popup.onDismissed
            )}
          />
        )
      case PopupType.GenerateCommitMessageOverrideWarning: {
        return (
          <GenerateCommitMessageOverrideWarning
            key="generate-commit-message-override-warning"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            filesSelected={popup.filesSelected}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.GenerateCommitMessageDisclaimer: {
        return (
          <GenerateCommitMessageDisclaimer
            key="generate-commit-message-disclaimer"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            filesSelected={popup.filesSelected}
            onDismissed={onPopupDismissedFn}
          />
        )
      }
      case PopupType.CreateTask: {
        const tasksState = this.state.tasksState
        return (
          <CreateTaskDialog
            key="create-task"
            owner={popup.repository.gitHubRepository.owner.login}
            repoName={popup.repository.gitHubRepository.name}
            collaborators={tasksState.collaborators}
            labels={tasksState.labels}
            milestones={tasksState.milestones}
            projects={tasksState.projects}
            onDismissed={onPopupDismissedFn}
            onLoad={() => {
              // Fetch collaborators, labels, milestones, and projects for the repository
              this.props.dispatcher.fetchCollaborators(popup.repository)
              this.props.dispatcher.fetchLabels(popup.repository)
              this.props.dispatcher.fetchMilestones(popup.repository)
              this.props.dispatcher.fetchProjects(popup.repository)
            }}
            onCreateTask={async (
              title,
              body,
              assignees,
              labels,
              milestone,
              projectId,
              statusOptionId
            ) => {
              await this.props.dispatcher.createTask(
                popup.repository,
                title,
                body,
                assignees,
                labels,
                milestone,
                projectId,
                statusOptionId
              )
            }}
          />
        )
      }
      case PopupType.AddRepositoryDialog: {
        return (
          <AddRepositoryDialog
            key="add-repository-dialog"
            dispatcher={this.props.dispatcher}
            onDismissed={onPopupDismissedFn}
            initialTab={popup.initialTab}
            accounts={this.state.accounts}
            isTopMost={isTopMost}
          />
        )
      }
      default:
        return assertNever(popup, `Unknown popup type: ${popup}`)
    }
  }

  private onSecretDelegatedBypassLinkClick = () => {
    this.props.dispatcher.incrementMetric(
      'secretsDetectedOnPushDelegatedBypassLinkClickedCount'
    )
  }

  private onSecretRemediationInstructionsLinkClick = () => {
    this.props.dispatcher.incrementMetric(
      'secretRemediationInstructionsLinkClickedCount'
    )
  }

  private onDismissBypassPushProtection = (
    popup: string,
    popupDismiss: () => void
  ) => {
    return () => {
      popupDismiss()
      this.onPopupDismissed(popup)
    }
  }

  private setConfirmCommitFilteredChanges = (value: boolean) => {
    this.props.dispatcher.setConfirmCommitFilteredChanges(value)
  }

  private getPullRequestState() {
    const { selectedState } = this.state
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return null
    }

    return selectedState.state.pullRequestState
  }

  private openBypassPushProtection = (secret: ISecretScanResult) => {
    return new Promise<IAPICreatePushProtectionBypassResponse | null>(
      resolve => {
        this.props.dispatcher.showPopup({
          type: PopupType.BypassPushProtection,
          secret,
          bypassPushProtection: (
            secret: ISecretScanResult,
            reason: BypassReasonType
          ) => {
            this.bypassPushProtection(secret, reason)
              .then(response => {
                this.recordSecretBypassStats(reason)
                resolve(response)
              })
              .catch(error => {
                resolve(null)
                this.props.dispatcher.postError(error)
              })
              .finally(() => {
                this.props.dispatcher.closePopup(PopupType.BypassPushProtection)
              })
          },
          onDismissed: () => {
            resolve(null)
          },
        })
      }
    )
  }

  private recordSecretBypassStats = (reason: BypassReasonType) => {
    this.props.dispatcher.incrementMetric('secretsDetectedOnPushBypassedCount')
    switch (reason) {
      case BypassReason.FalsePositive:
        this.props.dispatcher.incrementMetric(
          'secretsDetectedOnPushBypassedAsFalsePositiveCount'
        )
        break
      case BypassReason.UsedInTests:
        this.props.dispatcher.incrementMetric(
          'secretsDetectedOnPushBypassedAsUsedInTestCount'
        )
        break
      case BypassReason.WillFixLater:
        this.props.dispatcher.incrementMetric(
          'secretsDetectedOnPushBypassedAsWillFixLaterCount'
        )
        break
      default:
        return assertNever(reason, `Unknown Bypass reason: ${reason}`)
    }
  }

  private bypassPushProtection = (
    secret: ISecretScanResult,
    reason: BypassReasonType
  ): Promise<IAPICreatePushProtectionBypassResponse | null> => {
    return this.props.dispatcher.createPushProtectionBypass(
      reason,
      secret.id,
      secret.bypassURL
    )
  }

  private getWarnForcePushDialogOnBegin(
    onBegin: () => void,
    onPopupDismissedFn: () => void
  ) {
    return () => {
      onBegin()
      onPopupDismissedFn()
    }
  }

  private onExitTutorialToHomeScreen = () => {
    const tutorialRepository = this.getSelectedTutorialRepository()
    if (!tutorialRepository) {
      return false
    }

    this.props.dispatcher.pauseTutorial(tutorialRepository)
    return true
  }

  private onCreateTutorialRepository = (account: Account) => {
    this.props.dispatcher.createTutorialRepository(account)
  }

  private onUpdateExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.updateExistingUpstreamRemote(repository)
  }

  private onIgnoreExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.ignoreExistingUpstreamRemote(repository)
  }

  private updateExistingLFSFilters = () => {
    this.props.dispatcher.installGlobalLFSFilters(true)
  }

  private editGlobalGitConfig = () =>
    this.props.dispatcher.editGlobalGitConfig()

  private initializeLFS = (repositories: ReadonlyArray<Repository>) => {
    this.props.dispatcher.installLFSHooks(repositories)
  }

  private onCloneRepositoriesTabSelected = (tab: CloneRepositoryTab) => {
    this.props.dispatcher.changeCloneRepositoriesTab(tab)
  }

  private onRefreshRepositories = (account: Account) => {
    this.props.dispatcher.refreshApiRepositories(account)
  }

  private onShowIntegrationsPreferences = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Integrations,
    })
  }

  private onBranchCreatedFromCommit = () => {
    const repositoryView = this.repositoryViewRef.current
    if (repositoryView !== null) {
      repositoryView.scrollCompareListToTop()
    }
  }

  private onOpenShellIgnoreWarning = (path: string) => {
    this.props.dispatcher.openShell(path, true)
  }

  private onCheckForNonStaggeredUpdates = () =>
    this.checkForUpdates(false, true)

  private showAcknowledgements = () => {
    this.props.dispatcher.showPopup({ type: PopupType.Acknowledgements })
  }

  private showTermsAndConditions = () => {
    this.props.dispatcher.showPopup({ type: PopupType.TermsAndConditions })
  }

  private onQuitAndInstall = () => updateStore.quitAndInstallUpdate()

  private renderPopups() {
    const popupContent = this.allPopupContent()

    return (
      <TransitionGroup>
        {popupContent && (
          <CSSTransition classNames="modal" timeout={dialogTransitionTimeout}>
            {popupContent}
          </CSSTransition>
        )}
      </TransitionGroup>
    )
  }

  private renderDragElement() {
    return <div id="dragElement">{this.renderCurrentDragElement()}</div>
  }

  /**
   * Render the current drag element based on it's type. Used in conjunction
   * with the `Draggable` component.
   */
  private renderCurrentDragElement(): JSX.Element | null {
    const { currentDragElement, emoji } = this.state
    if (currentDragElement === null) {
      return null
    }

    const { gitHubRepository, commit, selectedCommits } = currentDragElement
    switch (currentDragElement.type) {
      case DragType.Commit:
        return (
          <CommitDragElement
            gitHubRepository={gitHubRepository}
            commit={commit}
            selectedCommits={selectedCommits}
            emoji={emoji}
            accounts={this.state.accounts}
          />
        )
      default:
        return assertNever(
          currentDragElement.type,
          `Unknown drag element type: ${currentDragElement}`
        )
    }
  }

  private renderZoomInfo() {
    return <ZoomInfo windowZoomFactor={this.state.windowZoomFactor} />
  }

  private renderFullScreenInfo() {
    return <FullScreenInfo windowState={this.state.windowState} />
  }

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.props.dispatcher.setConfirmDiscardChangesSetting(value)
  }

  private onConfirmDiscardChangesPermanentlyChanged = (value: boolean) => {
    this.props.dispatcher.setConfirmDiscardChangesPermanentlySetting(value)
  }

  private onRetryAction = (retryAction: RetryAction) => {
    this.props.dispatcher.performRetry(retryAction)
  }

  private showPopup = (popup: Popup) => {
    this.props.dispatcher.showPopup(popup)
  }

  private setBanner = (banner: Banner) =>
    this.props.dispatcher.setBanner(banner)

  private getDesktopAppContentsClassNames = (): string => {
    const { currentDragElement } = this.state
    const isCommitBeingDragged =
      currentDragElement !== null && currentDragElement.type === DragType.Commit
    return classNames({
      'commit-being-dragged': isCommitBeingDragged,
    })
  }

  private renderApp() {
    return (
      <div
        id="desktop-app-contents"
        className={this.getDesktopAppContentsClassNames()}
      >
        {this.renderToolbar()}
        {this.renderBanner()}
        {this.state.projectViewOpen && this.state.selectedProject
          ? this.renderProjectView()
          : this.renderRepository()}
        {this.renderPopups()}
        {this.renderDragElement()}
      </div>
    )
  }

  private renderProjectView() {
    const { selectedProject, selectedState } = this.state
    if (!selectedProject) {
      return null
    }

    // Get the first available GitHub.com account (the user who can access the organization)
    const account = this.state.accounts[0]
    if (!account) {
      return null
    }

    // Get the currently selected repository, if any
    const repository = selectedState?.type === SelectionType.Repository
      ? selectedState.repository
      : null

    return (
      <ProjectView
        dispatcher={this.props.dispatcher}
        project={selectedProject}
        account={account}
        repository={repository}
        onClose={this.onCloseProjectView}
      />
    )
  }

  private onCloseProjectView = () => {
    this.props.dispatcher.setProjectViewOpen(false)
  }

  private getLocalRepositoryInfos = (): ReadonlyArray<ILocalRepoInfo> => {
    const localRepos: ILocalRepoInfo[] = []
    for (const repo of this.state.repositories) {
      if (repo instanceof Repository && repo.gitHubRepository) {
        localRepos.push({
          fullName: repo.gitHubRepository.fullName,
          path: repo.path,
        })
      }
    }
    return localRepos
  }

  private getLocalOnlyRepositories = (): ReadonlyArray<ILocalOnlyRepoInfo> => {
    const localOnlyRepos: ILocalOnlyRepoInfo[] = []
    for (const repo of this.state.repositories) {
      // Local-only repos are Repository instances without a gitHubRepository
      if (repo instanceof Repository && !repo.gitHubRepository) {
        localOnlyRepos.push({
          id: repo.id,
          name: repo.alias || repo.name,
          path: repo.path,
        })
      }
    }
    return localOnlyRepos
  }

  private getRecentAPIRepositories = (selectedOwner: string | null): ReadonlyArray<IAPIRepository> => {
    const { ownerRepositories, recentRepositories, repositories } = this.state
    const MAX_RECENT = 5

    // Build a map of ownerRepositories by fullName for quick lookup
    const apiRepoMap = new Map<string, IAPIRepository>()
    for (const apiRepo of ownerRepositories) {
      const fullName = `${apiRepo.owner.login}/${apiRepo.name}`.toLowerCase()
      apiRepoMap.set(fullName, apiRepo)
    }

    // Iterate through recent repos in order (maintains recency order)
    const result: IAPIRepository[] = []
    for (const repoId of recentRepositories) {
      if (result.length >= MAX_RECENT) break

      const repo = repositories.find(r => r.id === repoId)
      if (!(repo instanceof Repository) || !repo.gitHubRepository) {
        continue // Skip non-GitHub repos (handled separately)
      }

      const fullName = repo.gitHubRepository.fullName.toLowerCase()
      const apiRepo = apiRepoMap.get(fullName)

      if (!apiRepo) continue // Not in ownerRepositories (not loaded yet)

      // Filter by owner if one is selected
      if (selectedOwner && apiRepo.owner.login.toLowerCase() !== selectedOwner.toLowerCase()) {
        continue
      }

      result.push(apiRepo)
    }

    return result
  }

  private getRecentLocalOnlyRepositories = (): ReadonlyArray<ILocalOnlyRepoInfo> => {
    const { recentRepositories, repositories } = this.state
    const MAX_RECENT = 5

    const result: ILocalOnlyRepoInfo[] = []
    for (const repoId of recentRepositories) {
      if (result.length >= MAX_RECENT) break

      const repo = repositories.find(r => r.id === repoId)
      // Only include local-only repos (no gitHubRepository)
      if (repo instanceof Repository && !repo.gitHubRepository) {
        result.push({
          id: repo.id,
          name: repo.alias || repo.name,
          path: repo.path,
        })
      }
    }

    return result
  }

  private onLocalOnlyRepositoryClicked = (repoId: number) => {
    // Find the local-only repository by ID
    const localRepo = this.state.repositories.find(
      r => r instanceof Repository && r.id === repoId
    )

    if (localRepo) {
      this.onSelectionChanged(localRepo)
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private onCloneAPIRepository = (repo: IAPIRepository) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    this.showCloneRepo(repo.clone_url)
  }

  private onLocateRepository = (path: string) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    shell.showItemInFolder(path)
  }

  private onAddExistingRepository = async (repo: IAPIRepository) => {
    const path = await showOpenDialog({
      properties: ['openDirectory'],
    })

    if (path === null) {
      return
    }

    const repoType = await getRepositoryType(path)
    if (repoType.kind !== 'regular' && repoType.kind !== 'bare') {
      this.props.dispatcher.postError(
        new Error(
          `The selected folder is not a Git repository. Please choose a folder that contains a .git directory.`
        )
      )
      return
    }

    const addedRepos = await this.props.dispatcher.addRepositories([path])
    if (addedRepos.length > 0) {
      const addedRepo = addedRepos[0]
      await this.props.dispatcher.selectRepository(addedRepo)
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState
      ? this.state.selectedState.repository
      : null

    const { useCustomShell, selectedShell, selectedOwner, ownerRepositories, loadingOwnerRepos } = this.state
    const filterText = this.state.repositoryFilterText

    // Show GitHub repos when an owner is selected OR when "All Owners" with repos loaded
    const account = this.state.accounts.find(a => a.endpoint === getDotComAPIEndpoint())
    if (account && (selectedOwner || ownerRepositories.length > 0 || loadingOwnerRepos)) {
      const localRepos = this.getLocalRepositoryInfos()
      // Only show local-only repos in "All Owners" mode (when no specific owner selected)
      const localOnlyRepos = selectedOwner ? undefined : this.getLocalOnlyRepositories()
      // Get recent repos filtered by the selected owner
      const recentRepos = this.getRecentAPIRepositories(selectedOwner)
      // Only show recent local-only repos in "All Owners" mode
      const recentLocalOnlyRepos = selectedOwner ? undefined : this.getRecentLocalOnlyRepositories()
      return (
        <CloneableRepositoryFilterList
          account={account}
          selectedItem={this.state.selectedAPIRepository}
          onSelectionChanged={this.onAPIRepositorySelectionChanged}
          repositories={ownerRepositories.length > 0 ? ownerRepositories : null}
          recentRepositories={recentRepos}
          recentLocalOnlyRepositories={recentLocalOnlyRepos}
          loading={loadingOwnerRepos}
          filterText={filterText}
          onFilterTextChanged={this.onRepositoryFilterTextChanged}
          onRefreshRepositories={this.onRefreshOwnerRepositories}
          onItemClicked={this.onAPIRepositoryClicked}
          localRepositories={localRepos}
          localOnlyRepositories={localOnlyRepos}
          onLocalOnlyRepositoryClicked={this.onLocalOnlyRepositoryClicked}
          onCloneRepository={this.onCloneAPIRepository}
          onLocateRepository={this.onLocateRepository}
          onAddExistingRepository={this.onAddExistingRepository}
          renderPreFilter={this.renderNewRepositoryButton}
        />
      )
    }

    // Default: show local repositories
    return (
      <RepositoriesList
        filterText={filterText}
        onFilterTextChanged={this.onRepositoryFilterTextChanged}
        selectedRepository={selectedRepository}
        onSelectionChanged={this.onSelectionChanged}
        repositories={this.state.repositories}
        recentRepositories={this.state.recentRepositories}
        localRepositoryStateLookup={this.state.localRepositoryStateLookup}
        askForConfirmationOnRemoveRepository={
          this.state.askForConfirmationOnRepositoryRemoval
        }
        onRemoveRepository={this.removeRepository}
        onViewOnGitHub={this.viewOnGitHub}
        onOpenInShell={this.openInShell}
        onShowRepository={this.showRepository}
        onOpenInExternalEditor={this.openInExternalEditor}
        externalEditorLabel={this.externalEditorLabel}
        shellLabel={useCustomShell ? undefined : selectedShell}
        dispatcher={this.props.dispatcher}
      />
    )
  }

  private renderNewRepositoryButton = (): JSX.Element => {
    return (
      <Button
        className="new-repository-button"
        onClick={this.showAddRepositoryDialog}
        tooltip="Add repository"
      >
        <Octicon symbol={octicons.plus} />
      </Button>
    )
  }

  private showAddRepositoryDialog = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddRepositoryDialog,
    })
  }

  private onAPIRepositorySelectionChanged = (repo: IAPIRepository | null) => {
    this.props.dispatcher.setSelectedAPIRepository(repo)
  }

  private onRefreshOwnerRepositories = () => {
    // Refresh by re-selecting the owner
    if (this.state.selectedOwner) {
      this.props.dispatcher.setSelectedOwner(this.state.selectedOwner)
    }
  }

  private onAPIRepositoryClicked = (repo: IAPIRepository) => {
    // Check if this repo is already cloned locally
    const repoFullName = `${repo.owner.login}/${repo.name}`
    const localRepo = this.state.repositories.find(r => {
      if (r instanceof Repository && r.gitHubRepository) {
        return r.gitHubRepository.fullName === repoFullName
      }
      return false
    })

    if (localRepo) {
      // If already cloned, select it
      this.onSelectionChanged(localRepo)
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    } else {
      // If not cloned, open the clone dialog with this repo's URL
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
      this.showCloneRepo(repo.clone_url)
    }
  }

  private viewOnGitHub = (
    repository: Repository | CloningRepository | null
  ) => {
    if (!(repository instanceof Repository)) {
      return
    }

    const url = getGitHubHtmlUrl(repository)

    if (url) {
      this.props.dispatcher.openInBrowser(url)
    }
  }

  private openInShell = (repository: Repository | CloningRepository) => {
    if (!(repository instanceof Repository)) {
      return
    }

    this.props.dispatcher.openShell(repository.path)
  }

  private openFileInExternalEditor = (fullPath: string) => {
    this.props.dispatcher.openInExternalEditor(fullPath)
  }

  private openInExternalEditor = (
    repository: Repository | CloningRepository
  ) => {
    if (!(repository instanceof Repository)) {
      return
    }

    this.props.dispatcher.openInExternalEditor(repository.path)
  }

  private onOpenInExternalEditor = (path: string) => {
    const repository = this.state.selectedState?.repository
    if (repository === undefined) {
      return
    }

    const fullPath = Path.join(repository.path, path)
    this.props.dispatcher.openInExternalEditor(fullPath)
  }

  private showRepository = (repository: Repository | CloningRepository) => {
    if (!(repository instanceof Repository)) {
      return
    }

    shell.showFolderContents(repository.path)
  }

  private onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private onExitTutorial = () => {
    if (
      this.state.repositories.length === 1 &&
      isValidTutorialStep(this.state.currentOnboardingTutorialStep)
    ) {
      // If the only repository present is the tutorial repo,
      // prompt for confirmation and exit to the BlankSlateView
      this.props.dispatcher.showPopup({
        type: PopupType.ConfirmExitTutorial,
      })
    } else {
      // Otherwise pop open repositories panel
      this.onRepositoryDropdownStateChanged('open')
    }
  }

  private renderRepositoryToolbarButton() {
    const selection = this.state.selectedState

    const repository = selection ? selection.repository : null

    let icon: OcticonSymbol
    let title: string
    if (repository) {
      const alias = repository instanceof Repository ? repository.alias : null
      icon = iconForRepository(repository)
      const repoName = alias ?? repository.name
      // Show owner/repo format when "All Owners" is selected
      if (!this.state.selectedOwner && repository instanceof Repository && repository.gitHubRepository) {
        title = `${repository.gitHubRepository.owner.login}/${repoName}`
      } else {
        title = repoName
      }
    } else if (this.state.repositories.length > 0) {
      icon = octicons.repo
      title = __DARWIN__ ? 'Select a Repository' : 'Select a repository'
    } else {
      icon = octicons.repo
      title = __DARWIN__ ? 'No Repositories' : 'No repositories'
    }

    const isOpen =
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const tooltip = repository && !isOpen ? repository.path : undefined

    /** The dropdown focus trap will stop focus event propagation we made need
     * in some of our dialogs (noticed with Lists). Disabled this when dialogs
     * are open */
    const enableFocusTrap = this.state.currentPopup === null

    return (
      <ToolbarDropdown
        icon={icon}
        title={title}
        description={__DARWIN__ ? 'Current Repository' : 'Current repository'}
        tooltip={tooltip}
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        onContextMenu={this.onRepositoryToolbarButtonContextMenu}
        onDropdownStateChanged={this.onRepositoryDropdownStateChanged}
        dropdownContentRenderer={this.renderRepositoryList}
        dropdownState={currentState}
        enableFocusTrap={enableFocusTrap}
        showDisclosureArrow={true}
      />
    )
  }

  private onRepositoryToolbarButtonContextMenu = () => {
    const repository = this.state.selectedState?.repository
    if (repository === undefined) {
      return
    }

    const onChangeRepositoryAlias = (repository: Repository) => {
      this.props.dispatcher.showPopup({
        type: PopupType.ChangeRepositoryAlias,
        repository,
      })
    }

    const onRemoveRepositoryAlias = (repository: Repository) => {
      this.props.dispatcher.changeRepositoryAlias(repository, null)
    }

    const items = generateRepositoryListContextMenu({
      onRemoveRepository: this.removeRepository,
      onShowRepository: this.showRepository,
      onOpenInShell: this.openInShell,
      onOpenInExternalEditor: this.openInExternalEditor,
      askForConfirmationOnRemoveRepository:
        this.state.askForConfirmationOnRepositoryRemoval,
      externalEditorLabel: this.externalEditorLabel,
      onChangeRepositoryAlias: onChangeRepositoryAlias,
      onRemoveRepositoryAlias: onRemoveRepositoryAlias,
      onViewOnGitHub: this.viewOnGitHub,
      repository: repository,
      shellLabel: this.state.useCustomShell
        ? undefined
        : this.state.selectedShell,
    })

    showContextualMenu(items)
  }

  private renderPushPullToolbarButton() {
    const selection = this.state.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const state = selection.state
    const revertProgress = state.revertProgress
    if (revertProgress) {
      return (
        <RevertProgress
          progress={revertProgress}
          width={this.state.pushPullButtonWidth}
          dispatcher={this.props.dispatcher}
        />
      )
    }

    let remoteName = state.remote ? state.remote.name : null
    const progress = state.pushPullFetchProgress

    const { conflictState } = state.changesState

    const rebaseInProgress =
      conflictState !== null && conflictState.kind === 'rebase'

    const { aheadBehind, branchesState } = state
    const { pullWithRebase, tip } = branchesState

    if (tip.kind === TipState.Valid && tip.branch.upstreamRemoteName !== null) {
      remoteName = tip.branch.upstreamRemoteName

      if (tip.branch.upstreamWithoutRemote !== tip.branch.name) {
        remoteName = tip.branch.upstream
      }
    }

    const currentFoldout = this.state.currentFoldout

    const isDropdownOpen =
      currentFoldout !== null && currentFoldout.type === FoldoutType.PushPull

    const forcePushBranchState = getCurrentBranchForcePushState(
      branchesState,
      aheadBehind
    )

    /** The dropdown focus trap will stop focus event propagation we made need
     * in some of our dialogs (noticed with Lists). Disabled this when dialogs
     * are open */
    const enableFocusTrap = this.state.currentPopup === null

    return (
      <PushPullButton
        dispatcher={this.props.dispatcher}
        repository={selection.repository}
        aheadBehind={state.aheadBehind}
        numTagsToPush={state.tagsToPush !== null ? state.tagsToPush.length : 0}
        remoteName={remoteName}
        lastFetched={state.lastFetched}
        networkActionInProgress={state.isPushPullFetchInProgress}
        progress={progress}
        tipState={tip.kind}
        pullWithRebase={pullWithRebase}
        rebaseInProgress={rebaseInProgress}
        forcePushBranchState={forcePushBranchState}
        shouldNudge={
          this.state.currentOnboardingTutorialStep === TutorialStep.PushBranch
        }
        isDropdownOpen={isDropdownOpen}
        askForConfirmationOnForcePush={this.state.askForConfirmationOnForcePush}
        onDropdownStateChanged={this.onPushPullDropdownStateChanged}
        enableFocusTrap={enableFocusTrap}
        pushPullButtonWidth={this.state.pushPullButtonWidth}
      />
    )
  }

  private showCreateBranch = () => {
    const selection = this.state.selectedState

    // NB: This should never happen but in the case someone
    // manages to delete the last repository while the drop down is
    // open we'll just bail here.
    if (!selection || selection.type !== SelectionType.Repository) {
      return
    }

    // We explicitly disable the menu item in this scenario so this
    // should never happen.
    if (selection.state.branchesState.tip.kind === TipState.Unknown) {
      return
    }

    const repository = selection.repository

    return this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
    })
  }

  private openPullRequest = () => {
    const state = this.state.selectedState

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    const currentPullRequest = state.state.branchesState.currentPullRequest
    const dispatcher = this.props.dispatcher

    if (currentPullRequest == null) {
      dispatcher.createPullRequest(state.repository)
      dispatcher.incrementMetric('createPullRequestCount')
    } else {
      dispatcher.showPullRequest(state.repository)
    }
  }

  private startPullRequest = () => {
    const state = this.state.selectedState

    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.startPullRequest(state.repository)
  }

  private openCreatePullRequestInBrowser = (
    repository: Repository,
    branch: Branch
  ) => {
    this.props.dispatcher.openCreatePullRequestInBrowser(repository, branch)
  }

  private onPushPullDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.PushPull })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.PushPull)
    }
  }

  private onBranchDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    }
  }

  private renderBranchToolbarButton(): JSX.Element | null {
    const selection = this.state.selectedState

    if (selection == null || selection.type !== SelectionType.Repository) {
      return null
    }

    const currentFoldout = this.state.currentFoldout

    const isOpen =
      currentFoldout !== null && currentFoldout.type === FoldoutType.Branch

    const repository = selection.repository
    const { branchesState } = selection.state

    /** The dropdown focus trap will stop focus event propagation we made need
     * in some of our dialogs (noticed with Lists). Disabled this when dialogs
     * are open */
    const enableFocusTrap = this.state.currentPopup === null

    return (
      <BranchDropdown
        dispatcher={this.props.dispatcher}
        isOpen={isOpen}
        branchDropdownWidth={this.state.branchDropdownWidth}
        onDropDownStateChanged={this.onBranchDropdownStateChanged}
        repository={repository}
        repositoryState={selection.state}
        selectedTab={this.state.selectedBranchesTab}
        pullRequests={branchesState.openPullRequests}
        currentPullRequest={branchesState.currentPullRequest}
        isLoadingPullRequests={branchesState.isLoadingPullRequests}
        shouldNudge={
          this.state.currentOnboardingTutorialStep === TutorialStep.CreateBranch
        }
        showCIStatusPopover={this.state.showCIStatusPopover}
        emoji={this.state.emoji}
        enableFocusTrap={enableFocusTrap}
        underlineLinks={this.state.underlineLinks}
      />
    )
  }

  // we currently only render one banner at a time
  private renderBanner(): JSX.Element | null {
    // The inset light title bar style without the toolbar
    // can't support banners at the moment. So for the
    // no-repositories blank slate we'll have to live without
    // them.
    if (this.inNoRepositoriesViewState()) {
      return null
    }

    let banner = null
    if (this.state.currentBanner !== null) {
      banner = renderBanner(
        this.state.currentBanner,
        this.props.dispatcher,
        this.onBannerDismissed
      )
    } else if (
      this.state.isUpdateAvailableBannerVisible ||
      this.state.isUpdateShowcaseVisible
    ) {
      banner = this.renderUpdateBanner()
    }
    return (
      <div role="alert" aria-atomic="false">
        <TransitionGroup>
          {banner && (
            <CSSTransition
              classNames="banner"
              timeout={bannerTransitionTimeout}
            >
              {banner}
            </CSSTransition>
          )}
        </TransitionGroup>
      </div>
    )
  }

  private renderUpdateBanner() {
    return (
      <UpdateAvailable
        dispatcher={this.props.dispatcher}
        newReleases={updateStore.state.newReleases}
        isX64ToARM64ImmediateAutoUpdate={
          updateStore.state.isX64ToARM64ImmediateAutoUpdate
        }
        prioritizeUpdate={updateStore.state.prioritizeUpdate}
        prioritizeUpdateInfoUrl={updateStore.state.prioritizeUpdateInfoUrl}
        onDismissed={this.onUpdateAvailableDismissed}
        isUpdateShowcaseVisible={this.state.isUpdateShowcaseVisible}
        emoji={this.state.emoji}
        key={'update-available'}
      />
    )
  }

  private onBannerDismissed = () => {
    this.props.dispatcher.clearBanner()
  }

  private renderToolbar() {
    /**
     * No toolbar if we're in the blank slate view.
     */
    if (this.inNoRepositoriesViewState()) {
      return null
    }

    return (
      <Toolbar id="desktop-app-toolbar">
        {this.renderOwnerToolbarButton()}
        {this.renderProjectToolbarButton()}
        {this.renderRepositoryToolbarButton()}
        {this.renderBranchToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private organizationsLoadRequested = false

  private renderOwnerToolbarButton() {
    // Get the current account (prefer dotcom)
    const account = this.state.accounts.find(a => a.endpoint === getDotComAPIEndpoint())
    if (!account) {
      return null
    }

    // Load organizations if we haven't yet
    if (!this.organizationsLoadRequested) {
      this.organizationsLoadRequested = true
      this.props.dispatcher.loadOrganizations()
    }

    const { selectedOwner, currentFoldout } = this.state
    const isOpen = currentFoldout?.type === FoldoutType.Owner
    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const title = selectedOwner || 'All Owners'
    const icon = octicons.person

    return (
      <ToolbarDropdown
        className="owner-dropdown"
        icon={icon}
        title={title}
        description="Owner"
        onDropdownStateChanged={this.onOwnerDropdownStateChanged}
        dropdownContentRenderer={this.renderOwnerList}
        dropdownState={currentState}
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        showDisclosureArrow={true}
      />
    )
  }

  private renderOwnerList = (): JSX.Element => {
    const { selectedOwner, organizations, ownerFilterText } = this.state
    const account = this.state.accounts.find(a => a.endpoint === getDotComAPIEndpoint())

    const items: Array<{ id: string; login: string; isOrg: boolean }> = [
      { id: '', login: 'All Owners', isOrg: false },
    ]

    if (account) {
      items.push({ id: account.login, login: account.login, isOrg: false })
    }

    for (const org of organizations) {
      items.push({ id: org.login, login: org.login, isOrg: true })
    }

    // Filter items based on filter text
    const filterText = ownerFilterText?.toLowerCase() || ''
    const filteredItems = filterText
      ? items.filter(item => item.login.toLowerCase().includes(filterText))
      : items

    return (
      <div className="owner-dropdown-list">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter owners..."
          value={ownerFilterText || ''}
          onChange={e => this.setState({ ownerFilterText: e.target.value })}
          autoFocus
        />
        <div className="owner-dropdown-items">
          {filteredItems.map(item => {
            const isSelected =
              (item.id === '' && selectedOwner === null) ||
              item.login === selectedOwner
            return (
              <button
                key={item.id}
                className={`owner-dropdown-item ${isSelected ? 'selected' : ''}`}
                onClick={() => this.onOwnerSelected(item.id === '' ? null : item.login)}
                type="button"
              >
                <span className="owner-name">{item.login}</span>
                {isSelected && <Octicon symbol={octicons.check} />}
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  private onOwnerSelected = (owner: string | null) => {
    this.props.dispatcher.setSelectedOwner(owner)
    this.props.dispatcher.closeFoldout(FoldoutType.Owner)
  }

  private onOwnerDropdownStateChanged = (
    state: DropdownState,
    source: 'keyboard' | 'pointer'
  ) => {
    if (state === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Owner })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Owner)
    }
  }

  private renderProjectToolbarButton() {
    const { selectedProject, currentFoldout } = this.state

    const isOpen = currentFoldout?.type === FoldoutType.Project
    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    // Show owner in title when a project is selected
    let title = 'All Projects'
    if (selectedProject) {
      title = selectedProject.owner
        ? `${selectedProject.owner}/${selectedProject.title}`
        : selectedProject.title
    }
    const icon = octicons.project

    return (
      <ToolbarDropdown
        className="project-dropdown"
        icon={icon}
        title={title}
        description="Project"
        onClick={this.onProjectButtonClick}
        onDropdownStateChanged={this.onProjectDropdownStateChanged}
        dropdownContentRenderer={this.renderProjectList}
        dropdownState={currentState}
        dropdownStyle={ToolbarDropdownStyle.MultiOption}
        showDisclosureArrow={true}
      />
    )
  }

  private onProjectButtonClick = () => {
    // Navigate to project view (toggles it open/closed)
    const { selectedProject, projectViewOpen } = this.state
    if (selectedProject) {
      this.props.dispatcher.setProjectViewOpen(!projectViewOpen)
    }
  }

  private renderProjectList = (): JSX.Element => {
    const { selectedProject, ownerProjects, projectFilterText, selectedOwner } = this.state

    // Filter items based on filter text
    const filterText = projectFilterText?.toLowerCase() || ''
    const filteredProjects = filterText
      ? ownerProjects.filter(p =>
          p.title.toLowerCase().includes(filterText) ||
          (p.owner?.toLowerCase() || '').includes(filterText)
        )
      : ownerProjects

    // Group projects by owner when showing all owners
    const groupedProjects = new Map<string, IAPIProjectV2[]>()
    for (const project of filteredProjects) {
      const owner = project.owner || 'Unknown'
      if (!groupedProjects.has(owner)) {
        groupedProjects.set(owner, [])
      }
      groupedProjects.get(owner)!.push(project)
    }

    // Sort owners alphabetically
    const sortedOwners = Array.from(groupedProjects.keys()).sort()

    return (
      <div className="project-dropdown-list">
        <input
          type="text"
          className="filter-input"
          placeholder="Filter projects..."
          value={projectFilterText || ''}
          onChange={e => this.setState({ projectFilterText: e.target.value })}
          autoFocus
        />
        <div className="project-dropdown-items">
          {/* All Projects option */}
          <button
            key="all-projects"
            className={`project-dropdown-item ${selectedProject === null ? 'selected' : ''}`}
            onClick={() => this.onProjectSelected(null)}
            type="button"
          >
            <span className="project-name">All Projects</span>
            {selectedProject === null && <Octicon symbol={octicons.check} />}
          </button>

          {/* Show projects grouped by owner when "All Owners" is selected, otherwise flat list */}
          {!selectedOwner ? (
            // Grouped by owner
            sortedOwners.map(owner => (
              <div key={owner} className="project-owner-group">
                <div className="project-owner-header">{owner}</div>
                {groupedProjects.get(owner)!.map(project => {
                  const isSelected = selectedProject?.id === project.id
                  return (
                    <button
                      key={project.id}
                      className={`project-dropdown-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => this.onProjectSelected(project)}
                      type="button"
                    >
                      <span className="project-name">{project.title}</span>
                      {isSelected && <Octicon symbol={octicons.check} />}
                    </button>
                  )
                })}
              </div>
            ))
          ) : (
            // Flat list when specific owner is selected
            filteredProjects.map(project => {
              const isSelected = selectedProject?.id === project.id
              return (
                <button
                  key={project.id}
                  className={`project-dropdown-item ${isSelected ? 'selected' : ''}`}
                  onClick={() => this.onProjectSelected(project)}
                  type="button"
                >
                  <span className="project-name">{project.title}</span>
                  {isSelected && <Octicon symbol={octicons.check} />}
                </button>
              )
            })
          )}
        </div>
      </div>
    )
  }

  private onProjectSelected = (project: IAPIProjectV2 | null) => {
    this.props.dispatcher.setSelectedProject(project)
    this.props.dispatcher.closeFoldout(FoldoutType.Project)
    // Open project view when a project is selected, close when "All Projects" is selected
    this.props.dispatcher.setProjectViewOpen(project !== null)
  }

  private onProjectDropdownStateChanged = (
    state: DropdownState,
    source: 'keyboard' | 'pointer'
  ) => {
    if (state === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Project })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Project)
    }
  }

  private renderRepository() {
    const accounts = enableMultipleEnterpriseAccounts()
      ? this.state.accounts
      : this.oneAccountPerKind(this.state.accounts)

    if (this.inNoRepositoriesViewState()) {
      return (
        <NoRepositoriesView
          accounts={accounts}
          onCreate={this.showCreateRepository}
          onClone={this.showCloneRepo}
          onAdd={this.showAddLocalRepo}
          onCreateTutorialRepository={this.showCreateTutorialRepositoryPopup}
          onResumeTutorialRepository={this.onResumeTutorialRepository}
          tutorialPaused={this.isTutorialPaused()}
          apiRepositories={this.state.apiRepositories}
          onRefreshRepositories={this.onRefreshRepositories}
        />
      )
    }

    const state = this.state

    const selectedState = state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected />
    }

    if (selectedState.type === SelectionType.Repository) {
      return (
        <RepositoryView
          ref={this.repositoryViewRef}
          // When switching repositories we want to remount the RepositoryView
          // component to reset the scroll positions.
          key={selectedState.repository.hash}
          repository={selectedState.repository}
          repositories={this.state.repositories.filter((r): r is Repository => r instanceof Repository)}
          state={selectedState.state}
          dispatcher={this.props.dispatcher}
          emoji={state.emoji}
          sidebarWidth={state.sidebarWidth}
          commitSummaryWidth={state.commitSummaryWidth}
          stashedFilesWidth={state.stashedFilesWidth}
          issuesStore={this.props.issuesStore}
          gitHubUserStore={this.props.gitHubUserStore}
          onViewCommitOnGitHub={this.onViewCommitOnGitHub}
          imageDiffType={state.imageDiffType}
          hideWhitespaceInChangesDiff={state.hideWhitespaceInChangesDiff}
          hideWhitespaceInHistoryDiff={state.hideWhitespaceInHistoryDiff}
          showDiffCheckMarks={state.showDiffCheckMarks}
          showSideBySideDiff={state.showSideBySideDiff}
          focusCommitMessage={state.focusCommitMessage}
          askForConfirmationOnDiscardChanges={
            state.askForConfirmationOnDiscardChanges
          }
          askForConfirmationOnDiscardStash={
            state.askForConfirmationOnDiscardStash
          }
          askForConfirmationOnCheckoutCommit={
            state.askForConfirmationOnCheckoutCommit
          }
          askForConfirmationOnCommitFilteredChanges={
            state.askForConfirmationOnCommitFilteredChanges
          }
          accounts={state.accounts}
          isExternalEditorAvailable={
            state.useCustomEditor || state.selectedExternalEditor !== null
          }
          externalEditorLabel={this.externalEditorLabel}
          resolvedExternalEditor={state.resolvedExternalEditor}
          onOpenInExternalEditor={this.onOpenInExternalEditor}
          appMenu={state.appMenuState[0]}
          currentTutorialStep={state.currentOnboardingTutorialStep}
          onExitTutorial={this.onExitTutorial}
          isShowingModal={this.isShowingModal}
          isShowingFoldout={this.state.currentFoldout !== null}
          aheadBehindStore={this.props.aheadBehindStore}
          commitSpellcheckEnabled={this.state.commitSpellcheckEnabled}
          showCommitLengthWarning={this.state.showCommitLengthWarning}
          onCherryPick={this.startCherryPickWithoutBranch}
          pullRequestSuggestedNextAction={state.pullRequestSuggestedNextAction}
          showChangesFilter={state.showChangesFilter}
          shouldShowGenerateCommitMessageCallOut={
            !this.state.commitMessageGenerationButtonClicked
          }
          tasksState={state.tasksState}
          selectedProject={state.selectedProject}
          editorSettings={state.editorSettings}
        />
      )
    } else if (selectedState.type === SelectionType.CloningRepository) {
      return (
        <CloningRepositoryView
          repository={selectedState.repository}
          progress={selectedState.progress}
        />
      )
    } else if (selectedState.type === SelectionType.MissingRepository) {
      return (
        <MissingRepository
          repository={selectedState.repository}
          dispatcher={this.props.dispatcher}
        />
      )
    } else {
      return assertNever(selectedState, `Unknown state: ${selectedState}`)
    }
  }

  private renderWelcomeFlow() {
    return (
      <Welcome
        dispatcher={this.props.dispatcher}
        accounts={this.state.accounts}
        signInState={this.state.signInState}
      />
    )
  }

  public render() {
    if (this.loading) {
      return null
    }

    const className = classNames(
      this.state.appIsFocused ? 'focused' : 'blurred',
      {
        'underline-links': this.state.underlineLinks,
      }
    )

    const currentTheme = this.state.showWelcomeFlow
      ? ApplicationTheme.Light
      : this.state.currentTheme

    const currentTabSize = this.state.selectedTabSize

    return (
      <div
        id="desktop-app-chrome"
        className={className}
        style={{ tabSize: currentTabSize }}
      >
        <AppTheme theme={currentTheme} />
        {this.renderTitlebar()}
        {this.state.showWelcomeFlow
          ? this.renderWelcomeFlow()
          : this.renderApp()}
        {this.renderZoomInfo()}
        {this.renderFullScreenInfo()}
      </div>
    )
  }

  private onRepositoryFilterTextChanged = (text: string) => {
    this.props.dispatcher.setRepositoryFilterText(text)
  }

  private onSelectionChanged = (repository: Repository | CloningRepository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
  }

  private onViewCommitOnGitHub = async (SHA: string, filePath?: string) => {
    const repository = this.getRepository()

    if (
      !repository ||
      repository instanceof CloningRepository ||
      !repository.gitHubRepository
    ) {
      return
    }

    const commitURL = createCommitURL(
      repository.gitHubRepository,
      SHA,
      filePath
    )

    if (commitURL === null) {
      return
    }

    this.props.dispatcher.openInBrowser(commitURL)
  }

  private onBranchDeleted = (repository: Repository) => {
    // In the event a user is in the middle of a compare
    // we need to exit out of the compare state after the
    // branch has been deleted. Calling executeCompare allows
    // us to do just that.
    this.props.dispatcher.executeCompare(repository, {
      kind: HistoryTabMode.History,
    })
  }

  private inNoRepositoriesViewState() {
    return this.state.repositories.length === 0 || this.isTutorialPaused()
  }

  private isTutorialPaused() {
    return this.state.currentOnboardingTutorialStep === TutorialStep.Paused
  }

  /**
   * When starting cherry pick from context menu, we need to initialize the
   * cherry pick state flow step with the ChooseTargetBranch as opposed
   * to drag and drop which will start at the ShowProgress step.
   *
   * Step initialization must be done before and outside of the
   * `currentPopupContent` method because it is a rendering method that is
   * re-run on every update. It will just keep showing the step initialized
   * there otherwise - not allowing for other flow steps.
   */
  private startCherryPickWithoutBranch = (
    repository: Repository,
    commits: ReadonlyArray<CommitOneLine>
  ) => {
    const repositoryState = this.props.repositoryStateManager.get(repository)

    const { tip } = repositoryState.branchesState
    let currentBranch: Branch | null = null

    if (tip.kind === TipState.Valid) {
      currentBranch = tip.branch
    } else {
      throw new Error(
        'Tip is not in a valid state, which is required to start the cherry-pick flow'
      )
    }

    this.props.dispatcher.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.CherryPick,
        sourceBranch: currentBranch,
        branchCreated: false,
        commits,
      },
      null,
      commits,
      tip.branch.tip.sha
    )

    const initialStep = getMultiCommitOperationChooseBranchStep(repositoryState)

    this.props.dispatcher.setMultiCommitOperationStep(repository, initialStep)
    this.props.dispatcher.incrementMetric('cherryPickViaContextMenuCount')

    this.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  /**
   * Check if the user signed into their dotCom account has been tagged in
   * our release notes or if they already have received a thank you card.
   *
   * Notes: A user signed into a GHE account should not be contributing to
   * Desktop as that account should be used for GHE repos. Tho, technically it
   * is possible through commit misattribution and we are intentionally ignoring
   * this scenario as it would be expected any misattributed commit would not
   * be able to be detected.
   */
  private async checkIfThankYouIsInOrder(): Promise<void> {
    const dotComAccount = this.state.accounts.find(isDotComAccount)
    if (!dotComAccount) {
      // The user is not signed in or is a GHE user who should not have any.
      return
    }

    const { lastThankYou } = this.state
    const { login } = dotComAccount
    if (hasUserAlreadyBeenCheckedOrThanked(lastThankYou, login, getVersion())) {
      return
    }

    const isOnlyLastRelease =
      lastThankYou !== undefined && lastThankYou.checkedUsers.includes(login)
    const userContributions = await getUserContributions(
      isOnlyLastRelease,
      login
    )
    if (userContributions === null) {
      // This will prevent unnecessary release note retrieval on every time the
      // app is opened for a non-contributor.
      updateLastThankYou(
        this.props.dispatcher,
        lastThankYou,
        login,
        getVersion()
      )
      return
    }

    // If this is the first time user has seen the card, we want to thank them
    // for all previous versions. Thus, only specify current version if they
    // have been thanked before.
    const displayVersion = isOnlyLastRelease ? getVersion() : null
    const banner: Banner = {
      type: BannerType.OpenThankYouCard,
      // Grab emoji's by reference because we could still be loading emoji's
      emoji: this.state.emoji,
      onOpenCard: () =>
        this.openThankYouCard(userContributions, displayVersion, dotComAccount),
      onThrowCardAway: () => {
        updateLastThankYou(
          this.props.dispatcher,
          lastThankYou,
          login,
          getVersion()
        )
      },
    }
    this.setBanner(banner)
  }

  private openThankYouCard = (
    userContributions: ReadonlyArray<ReleaseNote>,
    latestVersion: string | null = null,
    account: Account
  ) => {
    const { friendlyName } = account

    this.props.dispatcher.showPopup({
      type: PopupType.ThankYou,
      userContributions,
      friendlyName,
      latestVersion,
    })
  }

  private onDragEnd = (dropTargetSelector: DropTargetSelector | undefined) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    if (dropTargetSelector === undefined) {
      this.props.dispatcher.incrementMetric('dragStartedAndCanceledCount')
    }
  }
}

function NoRepositorySelected() {
  return <div className="panel blankslate">No repository selected</div>
}
