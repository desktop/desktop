import * as React from 'react'
import { TransitionGroup, CSSTransition } from 'react-transition-group'
import {
  IAppState,
  RepositorySectionTab,
  FoldoutType,
  SelectionType,
  HistoryTabMode,
  IRepositoryState,
} from '../lib/app-state'
import { defaultErrorHandler, Dispatcher } from './dispatcher'
import { AppStore, GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { shell } from '../lib/app-shell'
import { updateStore, UpdateStatus } from './lib/update-store'
import { FetchType } from '../models/fetch'
import { shouldRenderApplicationMenu } from './lib/features'
import { matchExistingRepository } from '../lib/repository-matching'
import { getDotComAPIEndpoint } from '../lib/api'
import { getVersion } from './lib/app-proxy'
import { getOS } from '../lib/get-os'
import { MenuEvent } from '../main-process/menu'
import {
  Repository,
  getGitHubHtmlUrl,
  isRepositoryWithGitHubRepository,
} from '../models/repository'
import { Branch } from '../models/branch'
import { findItemByAccessKey, itemIsSelectable } from '../models/app-menu'
import { Account } from '../models/account'
import { TipState } from '../models/tip'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { CloningRepository } from '../models/cloning-repository'

import { TitleBar, ZoomInfo, FullScreenInfo } from './window'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { CloningRepositoryView } from './cloning-repository'
import {
  Toolbar,
  ToolbarDropdown,
  DropdownState,
  PushPullButton,
  BranchDropdown,
  RevertProgress,
} from './toolbar'
import { iconForRepository, OcticonSymbolType } from './octicons'
import * as OcticonSymbol from './octicons/octicons.generated'
import {
  sendReady,
  isInApplicationFolder,
  selectAllWindowContents,
} from './main-process-proxy'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { UpdateAvailable, renderBanner } from './banners'
import { MissingRepository } from './missing-repository'
import { NoRepositoriesView } from './no-repositories'
import { AppTheme } from './app-theme'
import { ApplicationTheme } from './lib/application-theme'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { PopupType, Popup } from '../models/popup'
import {
  ForcePushBranchState,
  getCurrentBranchForcePushState,
} from '../lib/rebase'
import { Banner, BannerType } from '../models/banner'
import { TutorialStep, isValidTutorialStep } from '../models/tutorial-step'
import { findContributionTargetDefaultBranch } from '../lib/branch'
import { AheadBehindStore } from '../lib/stores/ahead-behind-store'
import { CommitOneLine } from '../models/commit'
import { CommitDragElement } from './drag-elements/commit-drag-element'
import classNames from 'classnames'
import {
  getUserContributions,
  hasUserAlreadyBeenCheckedOrThanked,
  updateLastThankYou,
} from '../lib/thank-you'
import { ReleaseNote } from '../models/release-notes'
import { DragType, DropTargetSelector } from '../models/drag-drop'
import { dragAndDropManager } from '../lib/drag-and-drop-manager'
import { MultiCommitOperationKind } from '../models/multi-commit-operation'
import { getMultiCommitOperationChooseBranchStep } from '../lib/multi-commit-operation'
import { clamp } from '../lib/clamp'
import { generateRepositoryListContextMenu } from './repositories-list/repository-list-item-context-menu'
import * as ipcRenderer from '../lib/ipc-renderer'
import { showNotification } from '../lib/notifications/show-notification'
import { generateDevReleaseSummary } from '../lib/release-notes'
import { getPullRequestCommitRef } from '../models/pull-request'
import { getRepositoryType } from '../lib/git'
import { showContextualMenu } from '../lib/menu-item'
import { createCommitURL } from '../lib/commit-url'
import { uuid } from '../lib/uuid'
import { AppPopup } from './dialog/app-popup'
import { buildAutocompletionProviders } from './autocompletion'

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

      // It is possible to obtain an error with no message. This was found to be
      // the case on a windows instance where there was not space on the hard
      // drive to download the installer. In this case, we want to override the
      // error message so the user is not given a blank dialog.
      const hasErrorMsg = error.message.trim().length > 0
      this.props.dispatcher.postError(
        hasErrorMsg ? error : new Error('Checking for updates failed.')
      )
    })

    ipcRenderer.on('launch-timing-stats', (_, stats) => {
      console.info(`App ready time: ${stats.mainReadyTime}ms`)
      console.info(`Load time: ${stats.loadTime}ms`)
      console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

      this.props.dispatcher.recordLaunchStats(stats)
    })

    ipcRenderer.on('certificate-error', (_, certificate, error, url) => {
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

    this.checkIfThankYouIsInOrder()
  }

  private onMenuEvent(name: MenuEvent): any {
    // Don't react to menu events when an error dialog is shown.
    if (name !== 'show-app-error' && this.state.errorCount > 1) {
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
        return this.showChanges()
      case 'show-history':
        return this.showHistory()
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
        this.props.dispatcher.recordMenuInitiatedUpdate()
        return this.updateBranchWithContributionTargetBranch()
      case 'compare-to-branch':
        return this.showHistory(true)
      case 'merge-branch':
        this.props.dispatcher.recordMenuInitiatedMerge()
        return this.mergeBranch()
      case 'squash-and-merge-branch':
        this.props.dispatcher.recordMenuInitiatedMerge(true)
        return this.mergeBranch(true)
      case 'rebase-branch':
        this.props.dispatcher.recordMenuInitiatedRebase()
        return this.showRebaseDialog()
      case 'show-repository-settings':
        return this.showRepositorySettings()
      case 'view-repository-on-github':
        return this.viewRepositoryOnGitHub()
      case 'compare-on-github':
        return this.openBranchOnGitub('compare')
      case 'branch-on-github':
        return this.openBranchOnGitub('tree')
      case 'create-issue-in-repository-on-github':
        return this.openIssueCreationOnGitHub()
      case 'open-in-shell':
        return this.openCurrentRepositoryInShell()
      case 'clone-repository':
        return this.showCloneRepo()
      case 'show-about':
        return this.showAbout()
      case 'boomtown':
        return this.boomtown()
      case 'go-to-commit-message':
        return this.goToCommitMessage()
      case 'open-pull-request':
        return this.openPullRequest()
      case 'preview-pull-request':
        return this.startPullRequest()
      case 'install-cli':
        return this.props.dispatcher.installCLI()
      case 'open-external-editor':
        return this.openCurrentRepositoryInExternalEditor()
      case 'select-all':
        return this.selectAll()
      case 'show-release-notes-popup':
        return this.showFakeReleaseNotesPopup()
      case 'show-stashed-changes':
        return this.showStashedChanges()
      case 'hide-stashed-changes':
        return this.hideStashedChanges()
      case 'test-show-notification':
        return this.testShowNotification()
      case 'test-prune-branches':
        return this.testPruneBranches()
      case 'find-text':
        return this.findText()
      case 'pull-request-check-run-failed':
        return this.testPullRequestCheckRunFailed()
      case 'show-app-error':
        return this.props.dispatcher.postError(
          new Error('Test Error - to use default error handler' + uuid())
        )
      default:
        return assertNever(name, `Unknown menu event name: ${name}`)
    }
  }

  /**
   * Show a release notes popup for a fake release, intended only to
   * make it easier to verify changes to the popup. Has no meaning
   * about a new release being available.
   */
  private async showFakeReleaseNotesPopup() {
    if (__DEV__) {
      this.props.dispatcher.showPopup({
        type: PopupType.ReleaseNotes,
        newReleases: await generateDevReleaseSummary(),
      })
    }
  }

  private testShowNotification() {
    if (
      __RELEASE_CHANNEL__ !== 'development' &&
      __RELEASE_CHANNEL__ !== 'test'
    ) {
      return
    }

    showNotification({
      title: 'Test notification',
      body: 'Click here! This is a test notification',
      onClick: () => this.props.dispatcher.showPopup({ type: PopupType.About }),
    })
  }

  private testPullRequestCheckRunFailed() {
    if (
      __RELEASE_CHANNEL__ !== 'development' &&
      __RELEASE_CHANNEL__ !== 'test'
    ) {
      return
    }

    const { selectedState } = this.state
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      defaultErrorHandler(
        new Error(
          'You must be in a GitHub repo, on a pull request branch, and your branch tip must be in a valid state.'
        ),
        this.props.dispatcher
      )
      return
    }

    const {
      repository,
      state: {
        branchesState: { currentPullRequest: pullRequest, tip },
      },
    } = selectedState

    const currentBranchName =
      tip.kind === TipState.Valid
        ? tip.branch.upstreamWithoutRemote ?? tip.branch.name
        : ''

    if (
      !isRepositoryWithGitHubRepository(repository) ||
      pullRequest === null ||
      currentBranchName === ''
    ) {
      defaultErrorHandler(
        new Error(
          'You must be in a GitHub repo, on a pull request branch, and your branch tip must be in a valid state.'
        ),
        this.props.dispatcher
      )
      return
    }

    const cachedStatus = this.props.dispatcher.tryGetCommitStatus(
      repository.gitHubRepository,
      getPullRequestCommitRef(pullRequest.pullRequestNumber)
    )

    if (cachedStatus?.checks === undefined) {
      // Probably be hard for this to happen as the checks start loading in the background for pr statuses
      defaultErrorHandler(
        new Error(
          'Your pull request must have cached checks. Try opening the checks popover and then try again.'
        ),
        this.props.dispatcher
      )
      return
    }

    const { checks } = cachedStatus

    const popup: Popup = {
      type: PopupType.PullRequestChecksFailed,
      pullRequest,
      repository,
      shouldChangeRepository: true,
      commitMessage: 'Adding this feature',
      commitSha: pullRequest.head.sha,
      checks,
    }

    this.showPopup(popup)
  }

  private testPruneBranches() {
    if (!__DEV__) {
      return
    }

    this.props.appStore._testPruneBranches()
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

  private boomtown() {
    setImmediate(() => {
      throw new Error('Boomtown!')
    })
  }

  private async goToCommitMessage() {
    await this.showChanges()
    this.props.dispatcher.setCommitMessageFocus(true)
  }

  private checkForUpdates(
    inBackground: boolean,
    skipGuidCheck: boolean = false
  ) {
    if (__LINUX__ || __RELEASE_CHANNEL__ === 'development') {
      return
    }

    updateStore.checkForUpdates(inBackground, skipGuidCheck)
  }

  private getDotComAccount(): Account | null {
    const dotComAccount = this.state.accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    return dotComAccount || null
  }

  private getEnterpriseAccount(): Account | null {
    const enterpriseAccount = this.state.accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )
    return enterpriseAccount || null
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

  private openBranchOnGitub(view: 'tree' | 'compare') {
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
    const account = this.getDotComAccount() || this.getEnterpriseAccount()

    if (account === null) {
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

  private async showHistory(showBranchList: boolean = false) {
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
  }

  private showChanges() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.closeCurrentFoldout()
    return this.props.dispatcher.changeRepositorySection(
      state.repository,
      RepositorySectionTab.Changes
    )
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
                openedWithAccessKey: true,
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
              openedWithAccessKey: false,
            })
          }
        }
      }
    }
  }

  private async handleDragAndDrop(fileList: FileList) {
    const paths = [...fileList].map(x => x.path)
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

  private getRepository(): Repository | CloningRepository | null {
    const state = this.state.selectedState
    if (state == null) {
      return null
    }

    return state.repository
  }

  private getRepositoryState(): IRepositoryState | null {
    const { selectedState } = this.state
    if (
      selectedState === null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return null
    }

    return selectedState.state
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

  private onUpdateAvailableDismissed = () =>
    this.props.dispatcher.setUpdateBannerVisibility(false)

  private onRefreshRepositories = (account: Account) => {
    this.props.dispatcher.refreshApiRepositories(account)
  }

  private buildAutocompletionProviders = (repository: Repository) => {
    return buildAutocompletionProviders(
      repository,
      this.props.dispatcher,
      this.state.emoji,
      this.props.issuesStore,
      this.props.gitHubUserStore,
      this.state.accounts
    )
  }

  private renderPopup() {
    const {
      accounts,
      signInState,
      selectedCloneRepositoryTab,
      apiRepositories,
      emoji,
      commitSpellcheckEnabled,
      resolvedExternalEditor,
      hideWhitespaceInPullRequestDiff,
      pullRequestFilesListWidth,
      currentPopup,

      askForConfirmationOnRepositoryRemoval,
      askForConfirmationOnDiscardChanges,
      askForConfirmationOnDiscardChangesPermanently,
      askForConfirmationOnDiscardStash,
      askForConfirmationOnForcePush,
      askForConfirmationOnUndoCommit,
      uncommittedChangesStrategy,
      selectedExternalEditor,
      useWindowsOpenSSH,
      notificationsEnabled,
      optOutOfUsageTracking,
      selectedShell,
      selectedTheme,
      customTheme,
      repositoryIndicatorsEnabled,
    } = this.state

    return (
      <AppPopup
        accounts={accounts}
        repositoryState={this.getRepositoryState()}
        selectedRepository={this.getRepository()}
        signInState={signInState}
        selectedCloneRepositoryTab={selectedCloneRepositoryTab}
        apiRepositories={apiRepositories}
        emoji={emoji}
        commitSpellcheckEnabled={commitSpellcheckEnabled}
        resolvedExternalEditor={resolvedExternalEditor}
        hideWhitespaceInPullRequestDiff={hideWhitespaceInPullRequestDiff}
        pullRequestFilesListWidth={pullRequestFilesListWidth}
        currentPopup={currentPopup}
        askForConfirmationOnRepositoryRemoval={
          askForConfirmationOnRepositoryRemoval
        }
        askForConfirmationOnDiscardChanges={askForConfirmationOnDiscardChanges}
        askForConfirmationOnDiscardChangesPermanently={
          askForConfirmationOnDiscardChangesPermanently
        }
        askForConfirmationOnDiscardStash={askForConfirmationOnDiscardStash}
        askForConfirmationOnForcePush={askForConfirmationOnForcePush}
        askForConfirmationOnUndoCommit={askForConfirmationOnUndoCommit}
        uncommittedChangesStrategy={uncommittedChangesStrategy}
        selectedExternalEditor={selectedExternalEditor}
        useWindowsOpenSSH={useWindowsOpenSSH}
        notificationsEnabled={notificationsEnabled}
        optOutOfUsageTracking={optOutOfUsageTracking}
        selectedShell={selectedShell}
        selectedTheme={selectedTheme}
        customTheme={customTheme}
        repositoryIndicatorsEnabled={repositoryIndicatorsEnabled}
        dispatcher={this.props.dispatcher}
        repositoryViewRef={this.repositoryViewRef}
        repositoryStateManager={this.props.repositoryStateManager}
        checkForUpdates={this.checkForUpdates}
        buildAutocompletionProviders={this.buildAutocompletionProviders}
      />
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

  private showPopup = (popup: Popup) => {
    this.props.dispatcher.showPopup(popup)
  }

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
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderDragElement()}
      </div>
    )
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState
      ? this.state.selectedState.repository
      : null
    const externalEditorLabel = this.state.selectedExternalEditor
      ? this.state.selectedExternalEditor
      : undefined
    const shellLabel = this.state.selectedShell
    const filterText = this.state.repositoryFilterText
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
        externalEditorLabel={externalEditorLabel}
        shellLabel={shellLabel}
        dispatcher={this.props.dispatcher}
      />
    )
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

    let icon: OcticonSymbolType
    let title: string
    if (repository) {
      const alias = repository instanceof Repository ? repository.alias : null
      icon = iconForRepository(repository)
      title = alias ?? repository.name
    } else if (this.state.repositories.length > 0) {
      icon = OcticonSymbol.repo
      title = __DARWIN__ ? 'Select a Repository' : 'Select a repository'
    } else {
      icon = OcticonSymbol.repo
      title = __DARWIN__ ? 'No Repositories' : 'No repositories'
    }

    const isOpen =
      this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const tooltip = repository && !isOpen ? repository.path : undefined

    const foldoutWidth = clamp(this.state.sidebarWidth)

    const foldoutStyle: React.CSSProperties = {
      position: 'absolute',
      marginLeft: 0,
      width: foldoutWidth,
      minWidth: foldoutWidth,
      height: '100%',
      top: 0,
    }

    return (
      <ToolbarDropdown
        icon={icon}
        title={title}
        description={__DARWIN__ ? 'Current Repository' : 'Current repository'}
        tooltip={tooltip}
        foldoutStyle={foldoutStyle}
        onContextMenu={this.onRepositoryToolbarButtonContextMenu}
        onDropdownStateChanged={this.onRepositoryDropdownStateChanged}
        dropdownContentRenderer={this.renderRepositoryList}
        dropdownState={currentState}
      />
    )
  }

  private onRepositoryToolbarButtonContextMenu = () => {
    const repository = this.state.selectedState?.repository
    if (repository === undefined) {
      return
    }

    const externalEditorLabel = this.state.selectedExternalEditor ?? undefined

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
      externalEditorLabel: externalEditorLabel,
      onChangeRepositoryAlias: onChangeRepositoryAlias,
      onRemoveRepositoryAlias: onRemoveRepositoryAlias,
      onViewOnGitHub: this.viewOnGitHub,
      repository: repository,
      shellLabel: this.state.selectedShell,
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
      return <RevertProgress progress={revertProgress} />
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
    }

    const isForcePush =
      getCurrentBranchForcePushState(branchesState, aheadBehind) ===
      ForcePushBranchState.Recommended

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
        isForcePush={isForcePush}
        shouldNudge={
          this.state.currentOnboardingTutorialStep === TutorialStep.PushBranch
        }
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
      dispatcher.recordCreatePullRequest()
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

    return (
      <BranchDropdown
        dispatcher={this.props.dispatcher}
        isOpen={isOpen}
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
      <TransitionGroup>
        {banner && (
          <CSSTransition classNames="banner" timeout={bannerTransitionTimeout}>
            {banner}
          </CSSTransition>
        )}
      </TransitionGroup>
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

    const width = clamp(this.state.sidebarWidth)

    return (
      <Toolbar id="desktop-app-toolbar">
        <div className="sidebar-section" style={{ width }}>
          {this.renderRepositoryToolbarButton()}
        </div>
        {this.renderBranchToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private renderRepository() {
    const state = this.state
    if (this.inNoRepositoriesViewState()) {
      return (
        <NoRepositoriesView
          dotComAccount={this.getDotComAccount()}
          enterpriseAccount={this.getEnterpriseAccount()}
          onCreate={this.showCreateRepository}
          onClone={this.showCloneRepo}
          onAdd={this.showAddLocalRepo}
          onCreateTutorialRepository={this.showCreateTutorialRepositoryPopup}
          onResumeTutorialRepository={this.onResumeTutorialRepository}
          tutorialPaused={this.isTutorialPaused()}
          apiRepositories={state.apiRepositories}
          onRefreshRepositories={this.onRefreshRepositories}
        />
      )
    }

    const selectedState = state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected />
    }

    if (selectedState.type === SelectionType.Repository) {
      const externalEditorLabel = state.selectedExternalEditor
        ? state.selectedExternalEditor
        : undefined

      return (
        <RepositoryView
          ref={this.repositoryViewRef}
          // When switching repositories we want to remount the RepositoryView
          // component to reset the scroll positions.
          key={selectedState.repository.hash}
          repository={selectedState.repository}
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
          showSideBySideDiff={state.showSideBySideDiff}
          focusCommitMessage={state.focusCommitMessage}
          askForConfirmationOnDiscardChanges={
            state.askForConfirmationOnDiscardChanges
          }
          askForConfirmationOnDiscardStash={
            state.askForConfirmationOnDiscardStash
          }
          accounts={state.accounts}
          externalEditorLabel={externalEditorLabel}
          resolvedExternalEditor={state.resolvedExternalEditor}
          onOpenInExternalEditor={this.openFileInExternalEditor}
          appMenu={state.appMenuState[0]}
          currentTutorialStep={state.currentOnboardingTutorialStep}
          onExitTutorial={this.onExitTutorial}
          isShowingModal={this.isShowingModal}
          isShowingFoldout={this.state.currentFoldout !== null}
          aheadBehindStore={this.props.aheadBehindStore}
          commitSpellcheckEnabled={this.state.commitSpellcheckEnabled}
          onCherryPick={this.startCherryPickWithoutBranch}
          pullRequestSuggestedNextAction={state.pullRequestSuggestedNextAction}
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
        optOut={this.state.optOutOfUsageTracking}
        accounts={this.state.accounts}
        signInState={this.state.signInState}
      />
    )
  }

  public render() {
    if (this.loading) {
      return null
    }

    const className = this.state.appIsFocused ? 'focused' : 'blurred'

    const currentTheme = this.state.showWelcomeFlow
      ? ApplicationTheme.Light
      : this.state.currentTheme

    return (
      <div id="desktop-app-chrome" className={className}>
        <AppTheme
          theme={currentTheme}
          customTheme={this.state.customTheme}
          useCustomTheme={
            this.state.selectedTheme === ApplicationTheme.HighContrast
          }
        />
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
    this.props.dispatcher.recordCherryPickViaContextMenu()

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
    const dotComAccount = this.getDotComAccount()
    if (dotComAccount === null) {
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
        this.openThankYouCard(userContributions, displayVersion),
      onThrowCardAway: () => {
        updateLastThankYou(
          this.props.dispatcher,
          lastThankYou,
          login,
          getVersion()
        )
      },
    }
    this.props.dispatcher.setBanner(banner)
  }

  private openThankYouCard = (
    userContributions: ReadonlyArray<ReleaseNote>,
    latestVersion: string | null = null
  ) => {
    const dotComAccount = this.getDotComAccount()

    if (dotComAccount === null) {
      // The user is not signed in or is a GHE user who should not have any.
      return
    }
    const { friendlyName } = dotComAccount

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
      this.props.dispatcher.recordDragStartedAndCanceled()
    }
  }
}

function NoRepositorySelected() {
  return <div className="panel blankslate">No repository selected</div>
}
