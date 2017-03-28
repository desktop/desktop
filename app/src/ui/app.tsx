import * as React from 'react'
import * as  ReactCSSTransitionGroup from 'react-addons-css-transition-group'
import { ipcRenderer, remote, shell } from 'electron'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { WindowControls } from './window/window-controls'
import { Dispatcher, AppStore, CloningRepository } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { MenuEvent, MenuIDs } from '../main-process/menu'
import { assertNever } from '../lib/fatal-error'
import { IAppState, RepositorySection, Popup, PopupType, FoldoutType, SelectionType } from '../lib/app-state'
import { Branches } from './branches'
import { RenameBranch } from './rename-branch'
import { DeleteBranch } from './delete-branch'
import { CloningRepositoryView } from './cloning-repository'
import { Toolbar, ToolbarDropdown, DropdownState, PushPullButton } from './toolbar'
import { Octicon, OcticonSymbol, iconForRepository } from './octicons'
import { setMenuEnabled, setMenuVisible } from './main-process-proxy'
import { DiscardChanges } from './discard-changes'
import { updateStore, UpdateState } from './lib/update-store'
import { getDotComAPIEndpoint } from '../lib/api'
import { ILaunchStats } from '../lib/stats'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { findItemByAccessKey, itemIsSelectable } from '../models/app-menu'
import { UpdateAvailable } from './updates'
import { Preferences } from './preferences'
import { User } from '../models/user'
import { TipState } from '../models/tip'
import { shouldRenderApplicationMenu } from './lib/features'
import { Merge } from './merge-branch'
import { RepositorySettings } from './repository-settings'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { AddExistingRepository, CreateRepository, CloneRepository } from './add-repository'
import { CreateBranch } from './create-branch'
import { SignIn } from './sign-in'

/** The interval at which we should check for updates. */
const UpdateCheckInterval = 1000 * 60 * 60 * 4

const SendStatsInterval = 1000 * 60 * 60 * 4

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
}

export const dialogTransitionEnterTimeout = 250
export const dialogTransitionLeaveTimeout = 100

export class App extends React.Component<IAppProps, IAppState> {

  /**
   * Used on non-macOS platforms to support the Alt key behavior for
   * the custom application menu. See the event handlers for window
   * keyup and keydown.
   */
  private lastKeyPressed: string | null = null

  /**
   * The instance of the application menu bar or null if no menu bar
   * is mounted. This will always be null when not on Windows since we
   * only render a custom menu bar on Windows.
   */
  private appMenuBar: AppMenuBar | null = null

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup || this.state.errors.length
  }

  public constructor(props: IAppProps) {
    super(props)

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)

      this.updateMenu(state)
    })

    props.appStore.onDidError(error => {
      props.dispatcher.postError(error)
    })

    ipcRenderer.on('menu-event', (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
      this.onMenuEvent(name)
    })

    updateStore.onDidChange(state => {
      const visibleItem = (function () {
        switch (state) {
          case UpdateState.CheckingForUpdates: return 'checking-for-updates'
          case UpdateState.UpdateReady: return 'quit-and-install-update'
          case UpdateState.UpdateNotAvailable: return 'check-for-updates'
          case UpdateState.UpdateAvailable: return 'downloading-update'
        }

        return assertNever(state, `Unknown update state: ${state}`)
      })() as MenuIDs

      const menuItems = new Set([
        'checking-for-updates',
        'downloading-update',
        'check-for-updates',
        'quit-and-install-update',
      ]) as Set<MenuIDs>

      menuItems.delete(visibleItem)
      for (const item of menuItems) {
        setMenuVisible(item, false)
      }

      setMenuVisible(visibleItem, true)

      if (state === UpdateState.UpdateReady) {
        this.props.dispatcher.showPopup({ type: PopupType.UpdateAvailable })
      }
    })

    updateStore.onError(error => {
      console.log(`Error checking for updates:`)
      console.error(error)

      this.props.dispatcher.postError(error)
    })

    setInterval(() => this.checkForUpdates(), UpdateCheckInterval)
    this.checkForUpdates()

    ipcRenderer.on('launch-timing-stats', (event: Electron.IpcRendererEvent, { stats }: { stats: ILaunchStats }) => {
      console.info(`App ready time: ${stats.mainReadyTime}ms`)
      console.info(`Load time: ${stats.loadTime}ms`)
      console.info(`Renderer ready time: ${stats.rendererReadyTime}ms`)

      this.props.dispatcher.recordLaunchStats(stats)
      this.props.dispatcher.reportStats()

      setInterval(() => this.props.dispatcher.reportStats(), SendStatsInterval)
    })
  }

  private updateMenu(state: IAppState) {
    const selectedState = state.selectedState
    const isHostedOnGitHub = this.getCurrentRepositoryGitHubURL() !== null

    let onNonDefaultBranch = false
    let onBranch = false
    let hasDefaultBranch = false
    let hasPublishedBranch = false
    let networkActionInProgress = false

    if (selectedState && selectedState.type === SelectionType.Repository) {
      const branchesState = selectedState.state.branchesState
      const tip = branchesState.tip
      const defaultBranch = branchesState.defaultBranch

      hasDefaultBranch = Boolean(defaultBranch)

      onBranch = tip.kind === TipState.Valid

      // If we are:
      //  1. on the default branch, or
      //  2. on an unborn branch, or
      //  3. on a detached HEAD
      // there's not much we can do.
      if (tip.kind === TipState.Valid) {
        if (defaultBranch !== null) {
          onNonDefaultBranch = tip.branch.name !== defaultBranch.name
        }

        hasPublishedBranch = !!tip.branch.upstream
      } else {
        onNonDefaultBranch = true
      }

      networkActionInProgress = selectedState.state.pushPullInProgress
    }

    setMenuEnabled('rename-branch', onNonDefaultBranch)
    setMenuEnabled('delete-branch', onNonDefaultBranch)
    setMenuEnabled('update-branch', onNonDefaultBranch && hasDefaultBranch)
    setMenuEnabled('merge-branch', onBranch)
    setMenuEnabled('view-repository-on-github', isHostedOnGitHub)
    setMenuEnabled('compare-branch', isHostedOnGitHub && hasPublishedBranch)
    setMenuEnabled('open-in-shell', onBranch)
    setMenuEnabled('push', !networkActionInProgress)
    setMenuEnabled('pull', !networkActionInProgress)
  }

  private onMenuEvent(name: MenuEvent): any {

    // Don't react to menu events when an error dialog is shown.
    if (this.state.errors.length) {
      return
    }

    switch (name) {
      case 'push': return this.push()
      case 'pull': return this.pull()
      case 'select-changes': return this.selectChanges()
      case 'select-history': return this.selectHistory()
      case 'add-local-repository': return this.showFileBrowser()
      case 'create-branch': return this.showCreateBranch()
      case 'show-branches': return this.showBranches()
      case 'remove-repository': return this.removeRepository()
      case 'create-repository': return this.createRepository()
      case 'rename-branch': return this.renameBranch()
      case 'delete-branch': return this.deleteBranch()
      case 'check-for-updates': return this.checkForUpdates()
      case 'quit-and-install-update': return updateStore.quitAndInstallUpdate()
      case 'show-preferences': return this.props.dispatcher.showPopup({ type: PopupType.Preferences })
      case 'choose-repository': return this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
      case 'open-working-directory': return this.openWorkingDirectory()
      case 'update-branch': return this.updateBranch()
      case 'merge-branch': return this.mergeBranch()
      case 'show-repository-settings' : return this.showRepositorySettings()
      case 'view-repository-on-github' : return this.viewRepositoryOnGitHub()
      case 'compare-branch': return this.compareBranch()
      case 'open-in-shell' : return this.openShell()
      case 'clone-repository': return this.showCloneRepo()
    }

    return assertNever(name, `Unknown menu event name: ${name}`)
  }

  private checkForUpdates() {
    if (__RELEASE_ENV__ === 'development' || __RELEASE_ENV__ === 'test') { return }

    const dotComUser = this.getDotComUser()
    const login = dotComUser ? dotComUser.login : ''
    updateStore.checkForUpdates(login)
  }

  private getDotComUser(): User | null {
    const state = this.props.appStore.getState()
    const users = state.users
    const dotComUser = users.find(u => u.endpoint === getDotComAPIEndpoint())
    return dotComUser || null
  }

  private getEnterpriseUser(): User | null {
    const state = this.props.appStore.getState()
    const users = state.users
    const enterpriseUser = users.find(u => u.endpoint !== getDotComAPIEndpoint())
    return enterpriseUser || null
  }

  private updateBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    const defaultBranch = state.state.branchesState.defaultBranch
    if (!defaultBranch) { return }

    this.props.dispatcher.mergeBranch(state.repository, defaultBranch.name)
  }

  private mergeBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.showPopup({
      type: PopupType.MergeBranch,
      repository: state.repository,
    })
  }

  private compareBranch() {
    const htmlURL = this.getCurrentRepositoryGitHubURL()
    if (!htmlURL) { return }

    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    const branchTip = state.state.branchesState.tip
    if (branchTip.kind !== TipState.Valid || !branchTip.branch.upstreamWithoutRemote) { return }

    const compareURL = `${htmlURL}/compare/${branchTip.branch.upstreamWithoutRemote}`
    this.props.dispatcher.openInBrowser(compareURL)
  }

  private openWorkingDirectory() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    shell.showItemInFolder(state.repository.path)
  }

  private renameBranch() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

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
    if (!state || state.type !== SelectionType.Repository) { return }

    const tip = state.state.branchesState.tip

    if (tip.kind === TipState.Valid) {
      this.props.dispatcher.showPopup({
        type: PopupType.DeleteBranch,
        repository: state.repository,
        branch: tip.branch,
      })
    }
  }

  private createRepository() {
    this.props.dispatcher.showPopup({
      type: PopupType.CreateRepository,
    })
  }

  private showBranches() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
  }

  private selectChanges() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.changeRepositorySection(state.repository, RepositorySection.Changes)
  }

  private selectHistory() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.changeRepositorySection(state.repository, RepositorySection.History)
  }

  private push() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.push(state.repository)
  }

  private async pull() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.pull(state.repository)
  }

  public componentDidMount() {
    document.ondragover = document.ondrop = (e) => {
      e.preventDefault()
    }

    document.body.ondrop = (e) => {
      const files = e.dataTransfer.files
      this.handleDragAndDrop(files)
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
    if (event.defaultPrevented) { return }

    if (this.isShowingModal) { return }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Alt') {

        // Immediately close the menu if open and the user hits Alt. This is
        // a Windows convention.
        if (this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.AppMenu) {
          this.props.dispatcher.setAppMenuState(menu => menu.withReset())
          this.props.dispatcher.closeFoldout()
        }

        this.props.dispatcher.setAccessKeyHighlightState(true)
      } else if (event.altKey && !event.ctrlKey && !event.metaKey) {
        if (this.state.appMenuState.length) {
          const candidates = this.state.appMenuState[0].items
          const menuItemForAccessKey = findItemByAccessKey(event.key, candidates)

          if (menuItemForAccessKey && itemIsSelectable(menuItemForAccessKey)) {
            if (menuItemForAccessKey.type === 'submenuItem') {
              this.props.dispatcher.setAppMenuState(menu => menu
                .withReset()
                .withSelectedItem(menuItemForAccessKey)
                .withOpenedMenu(menuItemForAccessKey, true))

              this.props.dispatcher.showFoldout({ type: FoldoutType.AppMenu, enableAccessKeyNavigation: true, openedWithAccessKey: true })
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
    if (event.defaultPrevented) { return }

    if (shouldRenderApplicationMenu()) {
      if (event.key === 'Alt') {
        this.props.dispatcher.setAccessKeyHighlightState(false)

        if (this.lastKeyPressed === 'Alt') {
          if (this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.AppMenu) {
            this.props.dispatcher.closeFoldout()
          }

          if (this.appMenuBar) {
            if (this.appMenuBar.menuButtonHasFocus) {
              this.appMenuBar.blurCurrentlyFocusedItem()
            } else {
              this.appMenuBar.focusFirstMenuItem()
            }
          }
        }
      }
    }
  }

  private handleDragAndDrop(fileList: FileList) {
    const paths: string[] = []
    for (let i = 0; i < fileList.length; i++) {
      const path = fileList[i]
      paths.push(path.path)
    }

    this.addRepositories(paths)
  }

  private showFileBrowser() {
    const directories = remote.dialog.
        showOpenDialog({ properties: [ 'openDirectory', 'multiSelections' ] })
    if (directories && directories.length > 0) {
      this.addRepositories(directories)
    }
  }

  private removeRepository() {
    const repository = this.getRepository()

    if (!repository) {
      return
    }

    this.props.dispatcher.removeRepositories([ repository ])
  }

  private getRepository(): Repository | CloningRepository | null {
    const state = this.state.selectedState
    if (!state) { return null}

    return state.repository
  }

  private async addRepositories(paths: ReadonlyArray<string>) {
    const repositories = await this.props.dispatcher.addRepositories(paths)
    if (repositories.length) {
      this.props.dispatcher.selectRepository(repositories[0])
    }
  }

  private showRepositorySettings() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }
    this.props.dispatcher.showPopup({ type: PopupType.RepositorySettings, repository })
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

    if (!repository || repository instanceof CloningRepository || !repository.gitHubRepository) {
      return null
    }

    return repository.gitHubRepository.htmlURL
  }

  private openShell() {
    const repository = this.getRepository()

    if (!repository || repository instanceof CloningRepository) {
      return
    }

    const repoFilePath = repository.path

    this.props.dispatcher.openShell(repoFilePath)
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
    const foldoutState = currentFoldout && currentFoldout.type === FoldoutType.AppMenu
      ? currentFoldout
      : null

    return (
      <AppMenuBar
        ref={this.onAppMenuBarRef}
        appMenu={this.state.appMenuState}
        dispatcher={this.props.dispatcher}
        highlightAppMenuAccessKeys={this.state.highlightAccessKeys}
        foldoutState={foldoutState}
      />
    )
  }

  private onAppMenuBarRef = (menuBar: AppMenuBar | null) => {
    this.appMenuBar = menuBar
  }

  private renderTitlebar() {
    const winControls = __WIN32__
      ? <WindowControls />
      : null

    // On Windows it's not possible to resize a frameless window if the
    // element that sits flush along the window edge has -webkit-app-region: drag.
    // The menu bar buttons all have no-drag but the area between menu buttons and
    // window controls need to disable dragging so we add a 3px tall element which
    // disables drag while still letting users drag the app by the titlebar below
    // those 3px.
    const resizeHandle = __WIN32__
      ? <div className='resize-handle' />
      : null

    const titleBarClass = this.state.titleBarStyle === 'light' ? 'light-title-bar' : ''

    const appIcon = __WIN32__ && !this.state.showWelcomeFlow
      ? <Octicon className='app-icon' symbol={OcticonSymbol.markGithub} />
      : null

    return (
      <div className={titleBarClass} id='desktop-app-title-bar'>
        {appIcon}
        {this.renderAppMenuBar()}
        {resizeHandle}
        {winControls}
      </div>
    )
  }

  private onPopupDismissed = () => {
    this.props.dispatcher.closePopup()
  }

  private onSignInDialogDismissed = () => {
    this.props.dispatcher.resetSignInState()
    this.onPopupDismissed()
  }

  private currentPopupContent(): JSX.Element | null {
    // Hide any dialogs while we're displaying an error
    if (this.state.errors.length) { return null }

    const popup = this.state.currentPopup

    if (!popup) { return null }

    switch (popup.type) {
      case PopupType.RenameBranch:
        return <RenameBranch dispatcher={this.props.dispatcher}
                repository={popup.repository}
                branch={popup.branch}/>
      case PopupType.DeleteBranch:
        return <DeleteBranch dispatcher={this.props.dispatcher}
                repository={popup.repository}
                branch={popup.branch}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.ConfirmDiscardChanges:
        return <DiscardChanges repository={popup.repository}
                dispatcher={this.props.dispatcher}
                files={popup.files}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.UpdateAvailable:
        return <UpdateAvailable dispatcher={this.props.dispatcher}/>
      case PopupType.Preferences:
        return <Preferences
                dispatcher={this.props.dispatcher}
                dotComUser={this.getDotComUser()}
                enterpriseUser={this.getEnterpriseUser()}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.MergeBranch: {
        const repository = popup.repository
        const state = this.props.appStore.getRepositoryState(repository)

        return <Merge
                dispatcher={this.props.dispatcher}
                repository={repository}
                branches={state.branchesState.allBranches}
                onDismissed={this.onPopupDismissed}/>
      }
      case PopupType.RepositorySettings: {
        const repository = popup.repository
        const state = this.props.appStore.getRepositoryState(repository)

        return <RepositorySettings
                remote={state.remote}
                dispatcher={this.props.dispatcher}
                repository={repository}
                onDismissed={this.onPopupDismissed}/>
      }
      case PopupType.SignIn:
        return <SignIn
                signInState={this.state.signInState}
                dispatcher={this.props.dispatcher}
                onDismissed={this.onSignInDialogDismissed}/>
      case PopupType.AddRepository:
        return <AddExistingRepository
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      case PopupType.CreateRepository:
        return (
          <CreateRepository
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher} />
        )
      case PopupType.CloneRepository:
        return <CloneRepository
                users={this.state.users}
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      case PopupType.CreateBranch: {
        const state = this.props.appStore.getRepositoryState(popup.repository)

        const tip = state.branchesState.tip
        const currentBranch = tip.kind === TipState.Valid
          ? tip.branch
          : null

        const repository = popup.repository

        return <CreateBranch
                currentBranch={currentBranch}
                branches={state.branchesState.allBranches}
                repository={repository}
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      }
      default:
        return assertNever(popup, `Unknown popup type: ${popup}`)
    }
  }

  private renderPopup() {
    return (
      <ReactCSSTransitionGroup
        transitionName='modal'
        component='div'
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.currentPopupContent()}
      </ReactCSSTransitionGroup>
    )
  }

  private clearError = (error: Error) => {
    this.props.dispatcher.clearError(error)
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
      <div id='desktop-app-contents'>
        {this.renderToolbar()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderAppError()}
      </div>
    )
  }

    private onAddMenuDropdownStateChanged = (newState: DropdownState) => {
    if (newState === 'open') {
      this.props.dispatcher.showFoldout({ type: FoldoutType.AddMenu, enableAccessKeyNavigation: false })
    } else {
      this.props.dispatcher.closeFoldout()
    }
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState ? this.state.selectedState.repository : null
    return <RepositoriesList
      selectedRepository={selectedRepository}
      onSelectionChanged={this.onSelectionChanged}
      dispatcher={this.props.dispatcher}
      repositories={this.state.repositories}
      loading={this.state.loading}
      />
  }

  private onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
      : this.props.dispatcher.closeFoldout()
  }

  private renderRepositoryToolbarButton() {
    const selection = this.state.selectedState

    const repository = selection ? selection.repository : null

    let icon: OcticonSymbol
    let title: string
    if (repository) {
      icon = iconForRepository(repository)
      title = repository.name
    } else {
      icon = OcticonSymbol.repo
      title = 'Select a repository'
    }

    const isOpen = this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const foldoutStyle = {
      position: 'absolute',
      marginLeft: 0,
      minWidth: this.state.sidebarWidth,
      height: '100%',
      top: 0,
    }

    return <ToolbarDropdown
      icon={icon}
      title={title}
      description='Current repository'
      foldoutStyle={foldoutStyle}
      onDropdownStateChanged={this.onRepositoryDropdownStateChanged}
      dropdownContentRenderer={this.renderRepositoryList}
      dropdownState={currentState} />
  }

  private renderPushPullToolbarButton() {
    const selection = this.state.selectedState
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const isPublishing = Boolean(this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.Publish)

    const state = selection.state
    const remoteName = state.remote ? state.remote.name : null
    return <PushPullButton
      dispatcher={this.props.dispatcher}
      repository={selection.repository}
      aheadBehind={state.aheadBehind}
      remoteName={remoteName}
      lastFetched={state.lastFetched}
      networkActionInProgress={state.pushPullInProgress}
      isPublishing={isPublishing}
      users={this.state.users}
      signInState={this.state.signInState}/>
  }

  private showCreateBranch = () => {
    const selection = this.state.selectedState

    // NB: This should never happen but in the case someone
    // manages to delete the last repository while the drop down is
    // open we'll just bail here.
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const repository = selection.repository

    this.props.dispatcher.closeFoldout()
    return this.props.dispatcher.showPopup({ type: PopupType.CreateBranch, repository })
  }


  private renderBranchFoldout = (): JSX.Element | null => {
    const selection = this.state.selectedState

    // NB: This should never happen but in the case someone
    // manages to delete the last repository while the drop down is
    // open we'll just bail here.
    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const repository = selection.repository

    const state = this.props.appStore.getRepositoryState(repository)

    const tip = state.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid
      ? tip.branch
      : null

    return <Branches
      allBranches={state.branchesState.allBranches}
      recentBranches={state.branchesState.recentBranches}
      currentBranch={currentBranch}
      defaultBranch={state.branchesState.defaultBranch}
      dispatcher={this.props.dispatcher}
      repository={repository}
    />
  }

  private onBranchDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
      : this.props.dispatcher.closeFoldout()
  }

  private renderBranchToolbarButton(): JSX.Element | null {
    const selection = this.state.selectedState

    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const tip = selection.state.branchesState.tip

    if (tip.kind === TipState.Unknown) {
      // TODO: this is bad and I feel bad
      return null
    }

    if (tip.kind === TipState.Unborn) {
      return <ToolbarDropdown
        className='branch-button'
        icon={OcticonSymbol.gitBranch}
        title='master'
        description='Current branch'
        onDropdownStateChanged={this.onBranchDropdownStateChanged}
        dropdownContentRenderer={this.renderBranchFoldout}
        dropdownState='closed' />
    }

    const isOpen = this.state.currentFoldout
      && this.state.currentFoldout.type === FoldoutType.Branch

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    if (tip.kind === TipState.Detached) {
      const title = `On ${tip.currentSha.substr(0,7)}`
      return <ToolbarDropdown
        className='branch-button'
        icon={OcticonSymbol.gitCommit}
        title={title}
        description='Detached HEAD'
        onDropdownStateChanged={this.onBranchDropdownStateChanged}
        dropdownContentRenderer={this.renderBranchFoldout}
        dropdownState={currentState} />
    }

    return <ToolbarDropdown
      className='branch-button'
      icon={OcticonSymbol.gitBranch}
      title={tip.branch.name}
      description='Current branch'
      onDropdownStateChanged={this.onBranchDropdownStateChanged}
      dropdownContentRenderer={this.renderBranchFoldout}
      dropdownState={currentState} />
  }

  private renderToolbar() {
    return (
      <Toolbar id='desktop-app-toolbar'>
        <div
          className='sidebar-section'
          style={{ width: this.state.sidebarWidth }}>
          {this.renderAddToolbarButton()}
          {this.renderRepositoryToolbarButton()}
        </div>
        {this.renderBranchToolbarButton()}
        {this.renderPushPullToolbarButton()}
      </Toolbar>
    )
  }

  private renderAddToolbarButton() {
    const isOpen = this.state.currentFoldout
      && this.state.currentFoldout.type === FoldoutType.AddMenu

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        icon={OcticonSymbol.plus}
        className='app-menu'
        dropdownContentRenderer={this.renderAddMenu}
        onDropdownStateChanged={this.onAddMenuDropdownStateChanged}
        dropdownState={currentState} />
    )
  }

  private renderAddMenu = (): JSX.Element | null => {
    const foldoutStyle = {
      width: this.state.sidebarWidth,
    }

    return (
      <div id='app-menu-foldout' style={foldoutStyle}>
        <ul className='menu-pane add-menu'>
          <li className='add-menu-item add-menu-item-header'>Repository</li>
          <li className='add-menu-item' onClick={this.showAddLocalRepo}>Add local repository</li>
          <li className='add-menu-item' onClick={this.showCreateRepo}>Create new repository</li>
          <li className='add-menu-item' onClick={this.showCloneRepo}>Clone repository</li>
          <li className='add-menu-item add-menu-item-header'>Branches</li>
          <li className='add-menu-item' onClick={this.showCreateBranch}>Create new branch</li>
        </ul>
      </div>
    )
  }

  private showAddLocalRepo = () => {
    this.props.dispatcher.closeFoldout()
    return this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private showCreateRepo = () => {
    this.props.dispatcher.closeFoldout()
    return this.props.dispatcher.showPopup({ type: PopupType.CreateRepository })
  }

  private showCloneRepo = () => {
    this.props.dispatcher.closeFoldout()
    return this.props.dispatcher.showPopup({ type: PopupType.CloneRepository })
  }

  private renderRepository() {
    const selectedState = this.state.selectedState
    if (!selectedState) {
      return <NoRepositorySelected/>
    }

    if (selectedState.type === SelectionType.Repository) {
      return (
        <RepositoryView repository={selectedState.repository}
                        state={selectedState.state}
                        dispatcher={this.props.dispatcher}
                        emoji={this.state.emoji}
                        sidebarWidth={this.state.sidebarWidth}
                        commitSummaryWidth={this.state.commitSummaryWidth}
                        issuesStore={this.props.appStore.issuesStore}
                        gitHubUserStore={this.props.appStore.gitHubUserStore}/>
      )
    } else if (selectedState.type === SelectionType.CloningRepository) {
      return <CloningRepositoryView repository={selectedState.repository}
                                    state={selectedState.state}/>
    } else if (selectedState.type === SelectionType.MissingRepository) {
      return <MissingRepository repository={selectedState.repository} dispatcher={this.props.dispatcher} users={this.state.users} />
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
    return (
      <div id='desktop-app-chrome'>
        {this.renderTitlebar()}
        {this.state.showWelcomeFlow ? this.renderWelcomeFlow() : this.renderApp()}
      </div>
    )
  }

  private onSelectionChanged = (repository: Repository | CloningRepository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.closeFoldout()

    if (repository instanceof Repository) {
      this.props.dispatcher.refreshGitHubRepositoryInfo(repository)
    }
  }
}

function NoRepositorySelected() {
  return (
    <div className='panel blankslate'>
      No repository selected
    </div>
  )
}
