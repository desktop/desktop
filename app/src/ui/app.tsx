import * as React from 'react'
import { ipcRenderer, remote } from 'electron'
import { CSSTransitionGroup } from 'react-transition-group'

import {
  IAppState,
  RepositorySectionTab,
  FoldoutType,
  SelectionType,
  HistoryTabMode,
  SuccessfulMergeBannerState,
} from '../lib/app-state'
import { Dispatcher } from '../lib/dispatcher'
import { AppStore, GitHubUserStore, IssuesStore } from '../lib/stores'
import { assertNever } from '../lib/fatal-error'
import { shell } from '../lib/app-shell'
import { updateStore, UpdateStatus } from './lib/update-store'
import { RetryAction } from '../models/retry-actions'
import { shouldRenderApplicationMenu } from './lib/features'
import { matchExistingRepository } from '../lib/repository-matching'
import { getDotComAPIEndpoint } from '../lib/api'
import { ILaunchStats } from '../lib/stats'
import { getVersion, getName } from './lib/app-proxy'
import { getOS } from '../lib/get-os'
import { validatedRepositoryPath } from '../lib/stores/helpers/validated-repository-path'

import { MenuEvent } from '../main-process/menu'

import { Repository } from '../models/repository'
import { Branch } from '../models/branch'
import { PreferencesTab } from '../models/preferences'
import { findItemByAccessKey, itemIsSelectable } from '../models/app-menu'
import { Account } from '../models/account'
import { TipState } from '../models/tip'
import { CloneRepositoryTab } from '../models/clone-repository-tab'
import { CloningRepository } from '../models/cloning-repository'

import { TitleBar, ZoomInfo, FullScreenInfo } from './window'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { RenameBranch } from './rename-branch'
import { DeleteBranch } from './delete-branch'
import { CloningRepositoryView } from './cloning-repository'
import {
  Toolbar,
  ToolbarDropdown,
  DropdownState,
  PushPullButton,
  BranchDropdown,
  RevertProgress,
} from './toolbar'
import { OcticonSymbol, iconForRepository } from './octicons'
import {
  showCertificateTrustDialog,
  registerContextualMenuActionDispatcher,
  sendReady,
} from './main-process-proxy'
import { DiscardChanges } from './discard-changes'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { UpdateAvailable } from './updates'
import { Preferences } from './preferences'
import { Merge } from './merge-branch'
import { RepositorySettings } from './repository-settings'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { AddExistingRepository, CreateRepository } from './add-repository'
import { CloneRepository } from './clone-repository'
import { CreateBranch } from './create-branch'
import { SignIn } from './sign-in'
import { InstallGit } from './install-git'
import { EditorError } from './editor'
import { About } from './about'
import { Publish } from './publish-repository'
import { Acknowledgements } from './acknowledgements'
import { UntrustedCertificate } from './untrusted-certificate'
import { BlankSlateView } from './blank-slate'
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
import { MergeConflictsDialog, MergeConflictsWarning } from './merge-conflicts'
import { AppTheme } from './app-theme'
import { ApplicationTheme } from './lib/application-theme'
import { RepositoryStateCache } from '../lib/stores/repository-state-cache'
import { AbortMergeWarning } from './abort-merge'
import { enableMergeConflictsDialog } from '../lib/feature-flag'
import { isConflictedFile } from '../lib/status'
import { PopupType, Popup } from '../models/popup'
import { SuccessfulMerge } from './banners'

const MinuteInMilliseconds = 1000 * 60

/** The interval at which we should check for updates. */
const UpdateCheckInterval = 1000 * 60 * 60 * 4

const SendStatsInterval = 1000 * 60 * 60 * 4

const InitialRepositoryIndicatorTimeout = 2 * MinuteInMilliseconds
const UpdateRepositoryIndicatorInterval = 15 * MinuteInMilliseconds

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly repositoryStateManager: RepositoryStateCache
  readonly appStore: AppStore
  readonly issuesStore: IssuesStore
  readonly gitHubUserStore: GitHubUserStore
  readonly startTime: number
}

export const dialogTransitionEnterTimeout = 250
export const dialogTransitionLeaveTimeout = 100

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

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup !== null || this.state.errors.length > 0
  }

  public constructor(props: IAppProps) {
    super(props)

    registerContextualMenuActionDispatcher()

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

      const initialTimeout = window.setTimeout(async () => {
        window.clearTimeout(initialTimeout)

        await this.props.appStore.refreshAllIndicators()

        this.updateIntervalHandle = window.setInterval(() => {
          this.props.appStore.refreshAllIndicators()
        }, UpdateRepositoryIndicatorInterval)
      }, InitialRepositoryIndicatorTimeout)
    })

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)
    })

    props.appStore.onDidError(error => {
      props.dispatcher.postError(error)
    })

    ipcRenderer.on(
      'menu-event',
      (event: Electron.IpcMessageEvent, { name }: { name: MenuEvent }) => {
        this.onMenuEvent(name)
      }
    )

    updateStore.onDidChange(state => {
      const status = state.status

      if (
        !(
          __RELEASE_CHANNEL__ === 'development' ||
          __RELEASE_CHANNEL__ === 'test'
        ) &&
        status === UpdateStatus.UpdateReady
      ) {
        this.props.dispatcher.setUpdateBannerVisibility(true)
      }
    })

    updateStore.onError(error => {
      log.error(`Error checking for updates`, error)

      this.props.dispatcher.postError(error)
    })

    ipcRenderer.on(
      'launch-timing-stats',
      (event: Electron.IpcMessageEvent, { stats }: { stats: ILaunchStats }) => {
        console.info(`App ready time: ${stats.mainReadyTime}ms`)
        console.info(`Load time: ${stats.loadTime}ms`)
        console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

        this.props.dispatcher.recordLaunchStats(stats)
      }
    )

    ipcRenderer.on(
      'certificate-error',
      (
        event: Electron.IpcMessageEvent,
        {
          certificate,
          error,
          url,
        }: { certificate: Electron.Certificate; error: string; url: string }
      ) => {
        this.props.dispatcher.showPopup({
          type: PopupType.UntrustedCertificate,
          certificate,
          url,
        })
      }
    )
  }

  public componentWillUnmount() {
    window.clearInterval(this.updateIntervalHandle)
  }

  private performDeferredLaunchActions() {
    // Loading emoji is super important but maybe less important that loading
    // the app. So defer it until we have some breathing space.
    this.props.appStore.loadEmoji()

    this.props.dispatcher.reportStats()
    setInterval(() => this.props.dispatcher.reportStats(), SendStatsInterval)

    this.props.dispatcher.installGlobalLFSFilters(false)

    setInterval(() => this.checkForUpdates(true), UpdateCheckInterval)
    this.checkForUpdates(true)

    log.info(`launching: ${getVersion()} (${getOS()})`)
    log.info(`execPath: '${process.execPath}'`)
  }

  private onMenuEvent(name: MenuEvent): any {
    // Don't react to menu events when an error dialog is shown.
    if (this.state.errors.length) {
      return
    }

    switch (name) {
      case 'push':
        return this.push()
      case 'pull':
        return this.pull()
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
      case 'show-preferences':
        return this.props.dispatcher.showPopup({ type: PopupType.Preferences })
      case 'open-working-directory':
        return this.openCurrentRepositoryWorkingDirectory()
      case 'update-branch': {
        this.props.dispatcher.recordMenuInitiatedUpdate()
        return this.updateBranch()
      }
      case 'compare-to-branch': {
        return this.showHistory(true)
      }
      case 'merge-branch': {
        this.props.dispatcher.recordMenuInitiatedMerge()
        return this.mergeBranch()
      }
      case 'show-repository-settings':
        return this.showRepositorySettings()
      case 'view-repository-on-github':
        return this.viewRepositoryOnGitHub()
      case 'compare-on-github':
        return this.compareBranchOnDotcom()
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
      case 'open-pull-request': {
        return this.openPullRequest()
      }
      case 'install-cli':
        return this.props.dispatcher.installCLI()
      case 'open-external-editor':
        return this.openCurrentRepositoryInExternalEditor()
      case 'select-all':
        return this.selectAll()
    }

    return assertNever(name, `Unknown menu event name: ${name}`)
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
      remote.getCurrentWebContents().selectAll()
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

  private checkForUpdates(inBackground: boolean) {
    if (__LINUX__) {
      return
    }

    if (
      __RELEASE_CHANNEL__ === 'development' ||
      __RELEASE_CHANNEL__ === 'test'
    ) {
      return
    }

    updateStore.checkForUpdates(inBackground)
  }

  private getDotComAccount(): Account | null {
    const state = this.props.appStore.getState()
    const accounts = state.accounts
    const dotComAccount = accounts.find(
      a => a.endpoint === getDotComAPIEndpoint()
    )
    return dotComAccount || null
  }

  private getEnterpriseAccount(): Account | null {
    const state = this.props.appStore.getState()
    const accounts = state.accounts
    const enterpriseAccount = accounts.find(
      a => a.endpoint !== getDotComAPIEndpoint()
    )
    return enterpriseAccount || null
  }

  private updateBranch() {
    const { selectedState } = this.state
    if (
      selectedState == null ||
      selectedState.type !== SelectionType.Repository
    ) {
      return
    }

    const { state } = selectedState
    const defaultBranch = state.branchesState.defaultBranch
    if (!defaultBranch) {
      return
    }

    const { mergeStatus } = state.compareState
    this.props.dispatcher.mergeBranch(
      selectedState.repository,
      defaultBranch.name,
      mergeStatus
    )
  }

  private mergeBranch() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.showPopup({
      type: PopupType.MergeBranch,
      repository: state.repository,
    })
  }

  private compareBranchOnDotcom() {
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

    const compareURL = `${htmlURL}/compare/${
      branchTip.branch.upstreamWithoutRemote
    }`
    this.props.dispatcher.openInBrowser(compareURL)
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

  private showAddLocalRepo = () => {
    return this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private showCreateRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }

  private showCloneRepo = () => {
    return this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL: null,
    })
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

  private push() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.push(state.repository)
  }

  private async pull() {
    const state = this.state.selectedState
    if (state == null || state.type !== SelectionType.Repository) {
      return
    }

    this.props.dispatcher.pull(state.repository)
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
      if (event.key === 'Alt') {
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
    const paths: string[] = []
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i]
      paths.push(file.path)
    }

    // If they're bulk adding repositories then just blindly try to add them.
    // But if they just dragged one, use the dialog so that they can initialize
    // it if needed.
    if (paths.length > 1) {
      const addedRepositories = await this.addRepositories(paths)
      if (addedRepositories.length) {
        this.props.dispatcher.recordAddExistingRepository()
      }
    } else {
      // user may accidentally provide a folder within the repository
      // this ensures we use the repository root, if it is actually a repository
      // otherwise we consider it an untracked repository
      const first = paths[0]
      const path = (await validatedRepositoryPath(first)) || first

      const existingRepository = matchExistingRepository(
        this.state.repositories,
        path
      )

      if (existingRepository) {
        await this.props.dispatcher.selectRepository(existingRepository)
      } else {
        await this.showPopup({
          type: PopupType.AddRepository,
          path,
        })
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
      this.props.dispatcher.removeRepositories([repository], false)
      return
    }

    if (this.state.askForConfirmationOnRepositoryRemoval) {
      this.props.dispatcher.showPopup({
        type: PopupType.RemoveRepository,
        repository,
      })
    } else {
      this.props.dispatcher.removeRepositories([repository], false)
    }
  }

  private onConfirmRepoRemoval = (
    repository: Repository,
    deleteRepoFromDisk: boolean
  ) => {
    this.props.dispatcher.removeRepositories([repository], deleteRepoFromDisk)
  }

  private getRepository(): Repository | CloningRepository | null {
    const state = this.state.selectedState
    if (state == null) {
      return null
    }

    return state.repository
  }

  private async addRepositories(paths: ReadonlyArray<string>) {
    const repositories = await this.props.dispatcher.addRepositories(paths)
    if (repositories.length) {
      this.props.dispatcher.selectRepository(repositories[0])
    }

    return repositories
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

  private viewRepositoryOnGitHub() {
    const url = this.getCurrentRepositoryGitHubURL()

    if (url) {
      this.props.dispatcher.openInBrowser(url)
      return
    }
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

  private openCurrentRepositoryInShell() {
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

    return (
      <TitleBar
        showAppIcon={showAppIcon}
        titleBarStyle={this.state.titleBarStyle}
        windowState={this.state.windowState}
        windowZoomFactor={this.state.windowZoomFactor}
      >
        {this.renderAppMenuBar()}
      </TitleBar>
    )
  }

  private onPopupDismissed = () => this.props.dispatcher.closePopup()

  private onSignInDialogDismissed = () => {
    this.props.dispatcher.resetSignInState()
    this.onPopupDismissed()
  }

  private onContinueWithUntrustedCertificate = (
    certificate: Electron.Certificate
  ) => {
    this.props.dispatcher.closePopup()
    showCertificateTrustDialog(
      certificate,
      'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.'
    )
  }

  private onUpdateAvailableDismissed = () =>
    this.props.dispatcher.setUpdateBannerVisibility(false)

  private onSuccessfulMergeDismissed = () =>
    this.props.dispatcher.setSuccessfulMergeBannerState(null)

  private currentPopupContent(): JSX.Element | null {
    // Hide any dialogs while we're displaying an error
    if (this.state.errors.length) {
      return null
    }

    const popup = this.state.currentPopup

    if (!popup) {
      return null
    }

    switch (popup.type) {
      case PopupType.RenameBranch:
        return (
          <RenameBranch
            key="rename-branch"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
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
            onDismissed={this.onPopupDismissed}
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
            onDismissed={this.onPopupDismissed}
            onConfirmDiscardChangesChanged={this.onConfirmDiscardChangesChanged}
          />
        )
      case PopupType.Preferences:
        return (
          <Preferences
            key="preferences"
            initialSelectedTab={popup.initialSelectedTab}
            dispatcher={this.props.dispatcher}
            dotComAccount={this.getDotComAccount()}
            confirmRepositoryRemoval={
              this.state.askForConfirmationOnRepositoryRemoval
            }
            confirmDiscardChanges={
              this.state.askForConfirmationOnDiscardChanges
            }
            selectedExternalEditor={this.state.selectedExternalEditor}
            optOutOfUsageTracking={this.props.appStore.getStatsOptOut()}
            enterpriseAccount={this.getEnterpriseAccount()}
            onDismissed={this.onPopupDismissed}
            selectedShell={this.state.selectedShell}
            selectedTheme={this.state.selectedTheme}
          />
        )
      case PopupType.MergeBranch: {
        const { repository, branch } = popup
        const state = this.props.repositoryStateManager.get(repository)

        const tip = state.branchesState.tip

        // we should never get in this state since we disable the menu
        // item in a detatched HEAD state, this check is so TSC is happy
        if (tip.kind !== TipState.Valid) {
          return null
        }

        const currentBranch = tip.branch

        return (
          <Merge
            key="merge-branch"
            dispatcher={this.props.dispatcher}
            repository={repository}
            allBranches={state.branchesState.allBranches}
            defaultBranch={state.branchesState.defaultBranch}
            recentBranches={state.branchesState.recentBranches}
            currentBranch={currentBranch}
            initialBranch={branch}
            onDismissed={this.onPopupDismissed}
          />
        )
      }
      case PopupType.RepositorySettings: {
        const repository = popup.repository
        const state = this.props.repositoryStateManager.get(repository)

        return (
          <RepositorySettings
            key="repository-settings"
            remote={state.remote}
            dispatcher={this.props.dispatcher}
            repository={repository}
            onDismissed={this.onPopupDismissed}
          />
        )
      }
      case PopupType.SignIn:
        return (
          <SignIn
            key="sign-in"
            signInState={this.state.signInState}
            dispatcher={this.props.dispatcher}
            onDismissed={this.onSignInDialogDismissed}
          />
        )
      case PopupType.AddRepository:
        return (
          <AddExistingRepository
            key="add-existing-repository"
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher}
            path={popup.path}
          />
        )
      case PopupType.CreateRepository:
        return (
          <CreateRepository
            key="create-repository"
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher}
            initialPath={popup.path}
          />
        )
      case PopupType.CloneRepository:
        return (
          <CloneRepository
            key="clone-repository"
            dotComAccount={this.getDotComAccount()}
            enterpriseAccount={this.getEnterpriseAccount()}
            initialURL={popup.initialURL}
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher}
            selectedTab={this.state.selectedCloneRepositoryTab}
            onTabSelected={this.onCloneRepositoriesTabSelected}
          />
        )
      case PopupType.CreateBranch: {
        const state = this.props.repositoryStateManager.get(popup.repository)
        const branchesState = state.branchesState
        const repository = popup.repository

        if (branchesState.tip.kind === TipState.Unknown) {
          this.props.dispatcher.closePopup()
          return null
        }

        return (
          <CreateBranch
            key="create-branch"
            tip={branchesState.tip}
            defaultBranch={branchesState.defaultBranch}
            allBranches={branchesState.allBranches}
            repository={repository}
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher}
            initialName={popup.initialName || ''}
          />
        )
      }
      case PopupType.InstallGit:
        return (
          <InstallGit
            key="install-git"
            onDismissed={this.onPopupDismissed}
            onOpenShell={this.onOpenShellIgnoreWarning}
            path={popup.path}
          />
        )
      case PopupType.About:
        return (
          <About
            key="about"
            onDismissed={this.onPopupDismissed}
            applicationName={getName()}
            applicationVersion={getVersion()}
            onCheckForUpdates={this.onCheckForUpdates}
            onShowAcknowledgements={this.showAcknowledgements}
            onShowTermsAndConditions={this.showTermsAndConditions}
          />
        )
      case PopupType.PublishRepository:
        return (
          <Publish
            key="publish"
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            accounts={this.state.accounts}
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.UntrustedCertificate:
        return (
          <UntrustedCertificate
            key="untrusted-certificate"
            certificate={popup.certificate}
            url={popup.url}
            onDismissed={this.onPopupDismissed}
            onContinue={this.onContinueWithUntrustedCertificate}
          />
        )
      case PopupType.Acknowledgements:
        return (
          <Acknowledgements
            key="acknowledgements"
            onDismissed={this.onPopupDismissed}
            applicationVersion={getVersion()}
          />
        )
      case PopupType.RemoveRepository:
        return (
          <ConfirmRemoveRepository
            repository={popup.repository}
            onConfirmation={this.onConfirmRepoRemoval}
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.TermsAndConditions:
        return <TermsAndConditions onDismissed={this.onPopupDismissed} />
      case PopupType.PushBranchCommits:
        return (
          <PushBranchCommits
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            unPushedCommits={popup.unPushedCommits}
            onConfirm={this.openCreatePullRequestInBrowser}
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.CLIInstalled:
        return <CLIInstalled onDismissed={this.onPopupDismissed} />
      case PopupType.GenericGitAuthentication:
        return (
          <GenericGitAuthentication
            hostname={popup.hostname}
            onDismiss={this.onPopupDismissed}
            onSave={this.onSaveCredentials}
            retryAction={popup.retryAction}
          />
        )
      case PopupType.ExternalEditorFailed:
        const openPreferences = popup.openPreferences
        const suggestAtom = popup.suggestAtom

        return (
          <EditorError
            key="editor-error"
            message={popup.message}
            onDismissed={this.onPopupDismissed}
            showPreferencesDialog={this.onShowAdvancedPreferences}
            viewPreferences={openPreferences}
            suggestAtom={suggestAtom}
          />
        )
      case PopupType.OpenShellFailed:
        return (
          <ShellError
            key="shell-error"
            message={popup.message}
            onDismissed={this.onPopupDismissed}
            showPreferencesDialog={this.onShowAdvancedPreferences}
          />
        )
      case PopupType.InitializeLFS:
        return (
          <InitializeLFS
            repositories={popup.repositories}
            onDismissed={this.onPopupDismissed}
            onInitialize={this.initializeLFS}
          />
        )
      case PopupType.LFSAttributeMismatch:
        return (
          <AttributeMismatch
            onDismissed={this.onPopupDismissed}
            onUpdateExistingFilters={this.updateExistingLFSFilters}
          />
        )
      case PopupType.UpstreamAlreadyExists:
        return (
          <UpstreamAlreadyExists
            repository={popup.repository}
            existingRemote={popup.existingRemote}
            onDismissed={this.onPopupDismissed}
            onUpdate={this.onUpdateExistingUpstreamRemote}
            onIgnore={this.onIgnoreExistingUpstreamRemote}
          />
        )
      case PopupType.ReleaseNotes:
        return (
          <ReleaseNotes
            emoji={this.state.emoji}
            newRelease={popup.newRelease}
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.DeletePullRequest:
        return (
          <DeletePullRequest
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            branch={popup.branch}
            onDismissed={this.onPopupDismissed}
            pullRequest={popup.pullRequest}
          />
        )
      case PopupType.MergeConflicts:
        if (enableMergeConflictsDialog()) {
          const { selectedState } = this.state
          if (
            selectedState === null ||
            selectedState.type !== SelectionType.Repository
          ) {
            return null
          }

          const {
            workingDirectory,
            conflictState,
          } = selectedState.state.changesState

          if (conflictState === null) {
            return null
          }

          return (
            <MergeConflictsDialog
              dispatcher={this.props.dispatcher}
              repository={popup.repository}
              workingDirectory={workingDirectory}
              onDismissed={this.onPopupDismissed}
              openFileInExternalEditor={this.openFileInExternalEditor}
              resolvedExternalEditor={this.state.resolvedExternalEditor}
              openRepositoryInShell={this.openInShell}
              ourBranch={popup.ourBranch}
              theirBranch={popup.theirBranch}
            />
          )
        } else {
          return (
            <MergeConflictsWarning
              dispatcher={this.props.dispatcher}
              repository={popup.repository}
              onDismissed={this.onPopupDismissed}
            />
          )
        }
      case PopupType.AbortMerge:
        if (enableMergeConflictsDialog()) {
          const { selectedState } = this.state
          if (
            selectedState === null ||
            selectedState.type !== SelectionType.Repository
          ) {
            return null
          }
          const { workingDirectory } = selectedState.state.changesState
          // double check that this repository is actually in merge
          const isInConflictedMerge = workingDirectory.files.some(file =>
            isConflictedFile(file.status)
          )
          if (!isInConflictedMerge) {
            return null
          }

          return (
            <AbortMergeWarning
              dispatcher={this.props.dispatcher}
              repository={popup.repository}
              onDismissed={this.onPopupDismissed}
              ourBranch={popup.ourBranch}
              theirBranch={popup.theirBranch}
            />
          )
        }
        return null
      default:
        return assertNever(popup, `Unknown popup type: ${popup}`)
    }
  }

  private onUpdateExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.updateExistingUpstreamRemote(repository)
  }

  private onIgnoreExistingUpstreamRemote = (repository: Repository) => {
    this.props.dispatcher.ignoreExistingUpstreamRemote(repository)
  }

  private updateExistingLFSFilters = () => {
    this.props.dispatcher.installGlobalLFSFilters(true)
    this.onPopupDismissed()
  }

  private initializeLFS = (repositories: ReadonlyArray<Repository>) => {
    this.props.dispatcher.installLFSHooks(repositories)
    this.onPopupDismissed()
  }

  private onCloneRepositoriesTabSelected = (tab: CloneRepositoryTab) => {
    this.props.dispatcher.changeCloneRepositoriesTab(tab)
  }

  private onShowAdvancedPreferences = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.Preferences,
      initialSelectedTab: PreferencesTab.Advanced,
    })
  }

  private onOpenShellIgnoreWarning = (path: string) => {
    this.props.dispatcher.openShell(path, true)
    this.onPopupDismissed()
  }

  private onSaveCredentials = async (
    hostname: string,
    username: string,
    password: string,
    retryAction: RetryAction
  ) => {
    this.onPopupDismissed()

    await this.props.dispatcher.saveGenericGitCredentials(
      hostname,
      username,
      password
    )

    this.props.dispatcher.performRetry(retryAction)
  }

  private onCheckForUpdates = () => this.checkForUpdates(false)

  private showAcknowledgements = () => {
    this.props.dispatcher.showPopup({ type: PopupType.Acknowledgements })
  }

  private showTermsAndConditions = () => {
    this.props.dispatcher.showPopup({ type: PopupType.TermsAndConditions })
  }

  private renderPopup() {
    return (
      <CSSTransitionGroup
        transitionName="modal"
        component="div"
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.currentPopupContent()}
      </CSSTransitionGroup>
    )
  }

  private renderZoomInfo() {
    return <ZoomInfo windowZoomFactor={this.state.windowZoomFactor} />
  }

  private renderFullScreenInfo() {
    return <FullScreenInfo windowState={this.state.windowState} />
  }

  private clearError = (error: Error) => this.props.dispatcher.clearError(error)

  private onConfirmDiscardChangesChanged = (value: boolean) => {
    this.props.dispatcher.setConfirmDiscardChangesSetting(value)
  }

  private renderAppError() {
    return (
      <AppError
        errors={this.state.errors}
        onClearError={this.clearError}
        onShowPopup={this.showPopup}
      />
    )
  }

  private showPopup = (popup: Popup) => {
    this.props.dispatcher.showPopup(popup)
  }

  private renderApp() {
    return (
      <div id="desktop-app-contents">
        {this.renderToolbar()}
        {this.renderBanner()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderAppError()}
      </div>
    )
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState
      ? this.state.selectedState.repository
      : null
    const externalEditorLabel = this.state.selectedExternalEditor
    const shellLabel = this.state.selectedShell
    const filterText = this.state.repositoryFilterText
    return (
      <RepositoriesList
        filterText={filterText}
        onFilterTextChanged={this.onRepositoryFilterTextChanged}
        selectedRepository={selectedRepository}
        onSelectionChanged={this.onSelectionChanged}
        repositories={this.state.repositories}
        localRepositoryStateLookup={this.state.localRepositoryStateLookup}
        askForConfirmationOnRemoveRepository={
          this.state.askForConfirmationOnRepositoryRemoval
        }
        onRemoveRepository={this.removeRepository}
        onOpenInShell={this.openInShell}
        onShowRepository={this.showRepository}
        onOpenInExternalEditor={this.openInExternalEditor}
        externalEditorLabel={externalEditorLabel}
        shellLabel={shellLabel}
        dispatcher={this.props.dispatcher}
      />
    )
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

    shell.showItemInFolder(repository.path)
  }

  private onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
    } else {
      this.props.dispatcher.closeFoldout(FoldoutType.Repository)
    }
  }

  private renderRepositoryToolbarButton() {
    const selection = this.state.selectedState

    const repository = selection ? selection.repository : null

    let icon: OcticonSymbol
    let title: string
    if (repository) {
      icon = iconForRepository(repository)
      title = repository.name
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

    const foldoutStyle: React.CSSProperties = {
      position: 'absolute',
      marginLeft: 0,
      minWidth: this.state.sidebarWidth,
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
        onDropdownStateChanged={this.onRepositoryDropdownStateChanged}
        dropdownContentRenderer={this.renderRepositoryList}
        dropdownState={currentState}
      />
    )
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

    const remoteName = state.remote ? state.remote.name : null
    const progress = state.pushPullFetchProgress

    const tipState = state.branchesState.tip.kind

    return (
      <PushPullButton
        dispatcher={this.props.dispatcher}
        repository={selection.repository}
        aheadBehind={state.aheadBehind}
        remoteName={remoteName}
        lastFetched={state.lastFetched}
        networkActionInProgress={state.isPushPullFetchInProgress}
        progress={progress}
        tipState={tipState}
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
    } else {
      dispatcher.showPullRequest(state.repository)
    }
  }

  private openCreatePullRequestInBrowser = (
    repository: Repository,
    branch: Branch
  ) => {
    this.props.dispatcher.openCreatePullRequestInBrowser(repository, branch)
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
      !!currentFoldout && currentFoldout.type === FoldoutType.Branch

    const repository = selection.repository
    const branchesState = selection.state.branchesState

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
      />
    )
  }

  // we currently only render one banner at a time
  private renderBanner(): JSX.Element | null {
    let banner = null
    if (this.state.successfulMergeBannerState !== null) {
      banner = this.renderSuccessfulMergeBanner(
        this.state.successfulMergeBannerState
      )
    } else if (this.state.isUpdateAvailableBannerVisible) {
      banner = this.renderUpdateBanner()
    }
    return (
      <CSSTransitionGroup
        transitionName="banner"
        component="div"
        transitionEnterTimeout={500}
        transitionLeaveTimeout={400}
      >
        {banner}
      </CSSTransitionGroup>
    )
  }

  private renderUpdateBanner() {
    return (
      <UpdateAvailable
        dispatcher={this.props.dispatcher}
        newRelease={updateStore.state.newRelease}
        onDismissed={this.onUpdateAvailableDismissed}
        key={'update-available'}
      />
    )
  }

  private renderSuccessfulMergeBanner(
    successfulMergeBannerState: SuccessfulMergeBannerState
  ) {
    if (successfulMergeBannerState === null) {
      return null
    }
    return (
      <SuccessfulMerge
        ourBranch={successfulMergeBannerState.ourBranch}
        theirBranch={successfulMergeBannerState.theirBranch}
        onDismissed={this.onSuccessfulMergeDismissed}
        key={'successful-merge'}
      />
    )
  }

  private renderToolbar() {
    return (
      <Toolbar id="desktop-app-toolbar">
        <div
          className="sidebar-section"
          style={{ width: this.state.sidebarWidth }}
        >
          {this.renderRepositoryToolbarButton()}
        </div>
        {this.renderBranchToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private renderRepository() {
    const state = this.state
    if (state.repositories.length < 1) {
      return (
        <BlankSlateView
          onCreate={this.showCreateRepository}
          onClone={this.showCloneRepo}
          onAdd={this.showAddLocalRepo}
        />
      )
    }

    const selectedState = state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected />
    }

    if (selectedState.type === SelectionType.Repository) {
      const externalEditorLabel = state.selectedExternalEditor

      return (
        <RepositoryView
          repository={selectedState.repository}
          state={selectedState.state}
          dispatcher={this.props.dispatcher}
          emoji={state.emoji}
          sidebarWidth={state.sidebarWidth}
          commitSummaryWidth={state.commitSummaryWidth}
          issuesStore={this.props.issuesStore}
          gitHubUserStore={this.props.gitHubUserStore}
          onViewCommitOnGitHub={this.onViewCommitOnGitHub}
          imageDiffType={state.imageDiffType}
          focusCommitMessage={state.focusCommitMessage}
          askForConfirmationOnDiscardChanges={
            state.askForConfirmationOnDiscardChanges
          }
          accounts={state.accounts}
          externalEditorLabel={externalEditorLabel}
          onOpenInExternalEditor={this.openFileInExternalEditor}
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
        appStore={this.props.appStore}
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
      : this.state.selectedTheme

    return (
      <div id="desktop-app-chrome" className={className}>
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

  private onViewCommitOnGitHub = async (SHA: string) => {
    const repository = this.getRepository()

    if (
      !repository ||
      repository instanceof CloningRepository ||
      !repository.gitHubRepository
    ) {
      return
    }

    const baseURL = repository.gitHubRepository.htmlURL

    if (baseURL) {
      this.props.dispatcher.openInBrowser(`${baseURL}/commit/${SHA}`)
    }
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
}

function NoRepositorySelected() {
  return <div className="panel blankslate">No repository selected</div>
}
