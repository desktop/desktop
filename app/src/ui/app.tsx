import * as React from 'react'
import { ipcRenderer, shell } from 'electron'

import { RepositoriesList } from './repositories-list'
import { RepositoryView } from './repository'
import { WindowControls } from './window/window-controls'
import { Dispatcher, AppStore, CloningRepository } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { MenuEvent } from '../main-process/menu'
import { assertNever } from '../lib/fatal-error'
import { IAppState, RepositorySection, Popup, PopupType, FoldoutType, SelectionType } from '../lib/app-state'
import { RenameBranch } from './rename-branch'
import { DeleteBranch } from './delete-branch'
import { CloningRepositoryView } from './cloning-repository'
import { Toolbar, ToolbarDropdown, DropdownState, PushPullButton, BranchDropdown } from './toolbar'
import { Octicon, OcticonSymbol, iconForRepository } from './octicons'
import { showCertificateTrustDialog, registerContextualMenuActionDispatcher } from './main-process-proxy'
import { DiscardChanges } from './discard-changes'
import { updateStore, UpdateStatus } from './lib/update-store'
import { getDotComAPIEndpoint } from '../lib/api'
import { ILaunchStats } from '../lib/stats'
import { Welcome } from './welcome'
import { AppMenuBar } from './app-menu'
import { findItemByAccessKey, itemIsSelectable } from '../models/app-menu'
import { UpdateAvailable } from './updates'
import { Preferences } from './preferences'
import { Account } from '../models/account'
import { TipState } from '../models/tip'
import { shouldRenderApplicationMenu } from './lib/features'
import { Merge } from './merge-branch'
import { RepositorySettings } from './repository-settings'
import { AppError } from './app-error'
import { MissingRepository } from './missing-repository'
import { AddExistingRepository, CreateRepository, CloneRepository } from './add-repository'
import { CreateBranch } from './create-branch'
import { SignIn } from './sign-in'
import { InstallGit } from './install-git'
import { About } from './about'
import { getVersion, getName } from './lib/app-proxy'
import { Publish } from './publish-repository'
import { Acknowledgements } from './acknowledgements'
import { UntrustedCertificate } from './untrusted-certificate'
import { CSSTransitionGroup } from 'react-transition-group'
import { BlankSlateView } from './blank-slate'
import { ConfirmRemoveRepository } from '../ui/remove-repository/confirm-remove-repository'
import { sendReady } from './main-process-proxy'
import { TermsAndConditions } from './terms-and-conditions'

/** The interval at which we should check for updates. */
const UpdateCheckInterval = 1000 * 60 * 60 * 4

const SendStatsInterval = 1000 * 60 * 60 * 4

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
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

  /**
   * Gets a value indicating whether or not we're currently showing a
   * modal dialog such as the preferences, or an error dialog.
   */
  private get isShowingModal() {
    return this.state.currentPopup || this.state.errors.length
  }

  public constructor(props: IAppProps) {
    super(props)

    registerContextualMenuActionDispatcher()

    props.dispatcher.loadInitialState().then(() => {
      this.loading = false
      this.forceUpdate()

      requestIdleCallback(() => {
        const now = Date.now()
        sendReady(now - props.startTime)

        // Loading emoji is super important but maybe less important that
        // loading the app. So defer it until we have some breathing space.
        requestIdleCallback(() => {
          props.appStore.loadEmoji()

          this.props.dispatcher.reportStats()

          setInterval(() => this.props.dispatcher.reportStats(), SendStatsInterval)
        })
      }, { timeout: ReadyDelay })
    })

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      this.setState(state)
    })

    props.appStore.onDidError(error => {
      props.dispatcher.postError(error)
    })

    ipcRenderer.on('menu-event', (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
      this.onMenuEvent(name)
    })

    updateStore.onDidChange(state => {
      const status = state.status

      if (!(__RELEASE_ENV__ === 'development' || __RELEASE_ENV__ === 'test') && status === UpdateStatus.UpdateReady) {
        this.props.dispatcher.setUpdateBannerVisibility(true)
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
    })

    ipcRenderer.on('certificate-error', (event: Electron.IpcRendererEvent, { certificate, error, url }: { certificate: Electron.Certificate, error: string, url: string }) => {
      this.props.dispatcher.showPopup({
        type: PopupType.UntrustedCertificate,
        certificate,
        url,
      })
    })
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
      case 'add-local-repository': return this.showAddLocalRepo()
      case 'create-branch': return this.showCreateBranch()
      case 'show-branches': return this.showBranches()
      case 'remove-repository': return this.removeRepository(this.getRepository())
      case 'create-repository': return this.showCreateRepository()
      case 'rename-branch': return this.renameBranch()
      case 'delete-branch': return this.deleteBranch()
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
      case 'show-about': return this.showAbout()
    }

    return assertNever(name, `Unknown menu event name: ${name}`)
  }

  private checkForUpdates() {
    if (__RELEASE_ENV__ === 'development' || __RELEASE_ENV__ === 'test') { return }

    updateStore.checkForUpdates(this.getUsernameForUpdateCheck(), true)
  }

  private getUsernameForUpdateCheck() {
    const dotComAccount = this.getDotComAccount()
    return dotComAccount ? dotComAccount.login : ''
  }

  private getDotComAccount(): Account | null {
    const state = this.props.appStore.getState()
    const accounts = state.accounts
    const dotComAccount = accounts.find(a => a.endpoint === getDotComAPIEndpoint())
    return dotComAccount || null
  }

  private getEnterpriseAccount(): Account | null {
    const state = this.props.appStore.getState()
    const accounts = state.accounts
    const enterpriseAccount = accounts.find(a => a.endpoint !== getDotComAPIEndpoint())
    return enterpriseAccount || null
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

  private showBranches() {
    const state = this.state.selectedState
    if (!state || state.type !== SelectionType.Repository) { return }

    this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
  }

  private showAbout() {
    this.props.dispatcher.showPopup({ type: PopupType.About })
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

  private handleDragAndDrop(fileList: FileList) {
    const paths: string[] = []
    for (let i = 0; i < fileList.length; i++) {
      const path = fileList[i]
      paths.push(path.path)
    }

    this.addRepositories(paths)
  }

  private removeRepository = (repository: Repository | CloningRepository | null) => {

    if (!repository) {
      return
    }

    if (repository instanceof CloningRepository) {
      this.props.dispatcher.removeRepositories([ repository ])
      return
    }

    if (this.state.confirmRepoRemoval) {
      this.props.dispatcher.showPopup({ type: PopupType.RemoveRepository, repository })
    } else {
      this.props.dispatcher.removeRepositories([ repository ])
    }
  }

  private onConfirmRepoRemoval = (repository: Repository) => {
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

    const menuBarActive = this.state.currentFoldout &&
      this.state.currentFoldout.type === FoldoutType.AppMenu

    // When we're in full-screen mode on Windows we only need to render
    // the title bar when the menu bar is active. On other platforms we
    // never render the title bar while in full-screen mode.
    if (inFullScreen) {
      if (!__WIN32__ || !menuBarActive) {
        return null
      }
    }

    // No Windows controls when we're in full-screen mode.
    const winControls = __WIN32__ && !inFullScreen
      ? <WindowControls />
      : null

    // On Windows it's not possible to resize a frameless window if the
    // element that sits flush along the window edge has -webkit-app-region: drag.
    // The menu bar buttons all have no-drag but the area between menu buttons and
    // window controls need to disable dragging so we add a 3px tall element which
    // disables drag while still letting users drag the app by the titlebar below
    // those 3px.
    const topResizeHandle = __WIN32__
      ? <div className='resize-handle top' />
      : null

    // And a 3px wide element on the left hand side.
    const leftResizeHandle = __WIN32__
      ? <div className='resize-handle left' />
      : null

    const titleBarClass = this.state.titleBarStyle === 'light' ? 'light-title-bar' : ''

    const appIcon = __WIN32__ && !this.state.showWelcomeFlow
      ? <Octicon className='app-icon' symbol={OcticonSymbol.markGithub} />
      : null

    return (
      <div className={titleBarClass} id='desktop-app-title-bar'>
        {topResizeHandle}
        {leftResizeHandle}
        {appIcon}
        {this.renderAppMenuBar()}
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

  private onContinueWithUntrustedCertificate = (certificate: Electron.Certificate) => {
    this.props.dispatcher.closePopup()
    showCertificateTrustDialog(certificate, 'Could not securely connect to the server, because its certificate is not trusted. Attackers might be trying to steal your information.\n\nTo connect unsafely, which may put your data at risk, you can “Always trust” the certificate and try again.')
  }

  private onUpdateAvailableDismissed = () => {
    this.props.dispatcher.setUpdateBannerVisibility(false)
  }

  private currentPopupContent(): JSX.Element | null {
    // Hide any dialogs while we're displaying an error
    if (this.state.errors.length) { return null }

    const popup = this.state.currentPopup

    if (!popup) { return null }

    switch (popup.type) {
      case PopupType.RenameBranch:
        return <RenameBranch
                key='rename-branch'
                dispatcher={this.props.dispatcher}
                repository={popup.repository}
                branch={popup.branch}/>
      case PopupType.DeleteBranch:
        return <DeleteBranch
                key='delete-branch'
                dispatcher={this.props.dispatcher}
                repository={popup.repository}
                branch={popup.branch}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.ConfirmDiscardChanges:
        return <DiscardChanges
                key='discard-changes'
                repository={popup.repository}
                dispatcher={this.props.dispatcher}
                files={popup.files}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.Preferences:
        return <Preferences
                key='preferences'
                dispatcher={this.props.dispatcher}
                dotComAccount={this.getDotComAccount()}
                confirmRepoRemoval={this.state.confirmRepoRemoval}
                optOutOfUsageTracking={this.props.appStore.getStatsOptOut()}
                enterpriseAccount={this.getEnterpriseAccount()}
                onDismissed={this.onPopupDismissed}/>
      case PopupType.MergeBranch: {
        const repository = popup.repository
        const state = this.props.appStore.getRepositoryState(repository)

        const tip = state.branchesState.tip
        const currentBranch = tip.kind === TipState.Valid
          ? tip.branch
          : null

        return <Merge
                key='merge-branch'
                dispatcher={this.props.dispatcher}
                repository={repository}
                allBranches={state.branchesState.allBranches}
                defaultBranch={state.branchesState.defaultBranch}
                recentBranches={state.branchesState.recentBranches}
                currentBranch={currentBranch}
                onDismissed={this.onPopupDismissed}
              />
      }
      case PopupType.RepositorySettings: {
        const repository = popup.repository
        const state = this.props.appStore.getRepositoryState(repository)

        return <RepositorySettings
                key='repository-settings'
                remote={state.remote}
                dispatcher={this.props.dispatcher}
                repository={repository}
                onDismissed={this.onPopupDismissed}/>
      }
      case PopupType.SignIn:
        return <SignIn
                key='sign-in'
                signInState={this.state.signInState}
                dispatcher={this.props.dispatcher}
                onDismissed={this.onSignInDialogDismissed}/>
      case PopupType.AddRepository:
        return <AddExistingRepository
                key='add-existing-repository'
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      case PopupType.CreateRepository:
        return (
          <CreateRepository
            key='create-repository'
            onDismissed={this.onPopupDismissed}
            dispatcher={this.props.dispatcher} />
        )
      case PopupType.CloneRepository:
        return <CloneRepository
                key='clone-repository'
                accounts={this.state.accounts}
                initialURL={popup.initialURL}
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      case PopupType.CreateBranch: {
        const state = this.props.appStore.getRepositoryState(popup.repository)
        const branchesState = state.branchesState
        const repository = popup.repository

        if (branchesState.tip.kind === TipState.Unknown) {
          this.props.dispatcher.closePopup()
          return null
        }

        return <CreateBranch
                key='create-branch'
                tip={branchesState.tip}
                defaultBranch={branchesState.defaultBranch}
                allBranches={branchesState.allBranches}
                repository={repository}
                onDismissed={this.onPopupDismissed}
                dispatcher={this.props.dispatcher} />
      }
      case PopupType.InstallGit:
        return (
          <InstallGit
           key='install-git'
           onDismissed={this.onPopupDismissed}
           path={popup.path} />
        )
      case PopupType.About:
        return (
          <About
           key='about'
           onDismissed={this.onPopupDismissed}
           applicationName={getName()}
           applicationVersion={getVersion()}
           usernameForUpdateCheck={this.getUsernameForUpdateCheck()}
           onShowAcknowledgements={this.showAcknowledgements}
           onShowTermsAndConditions={this.showTermsAndConditions}
          />
        )
      case PopupType.PublishRepository:
        return (
          <Publish
            key='publish'
            dispatcher={this.props.dispatcher}
            repository={popup.repository}
            accounts={this.state.accounts}
            onDismissed={this.onPopupDismissed}
        />
      )
      case PopupType.UntrustedCertificate:
        return (
          <UntrustedCertificate
            key='untrusted-certificate'
            certificate={popup.certificate}
            url={popup.url}
            onDismissed={this.onPopupDismissed}
            onContinue={this.onContinueWithUntrustedCertificate}
          />
        )
      case PopupType.Acknowledgements:
        return (
          <Acknowledgements
            key='acknowledgements'
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.RemoveRepository:
        const repo = popup.repository

        return (
          <ConfirmRemoveRepository
            repository={repo}
            onConfirmation={this.onConfirmRepoRemoval}
            onDismissed={this.onPopupDismissed}
          />
        )
      case PopupType.TermsAndConditions:
        return <TermsAndConditions onDismissed={this.onPopupDismissed}/>
      default:
        return assertNever(popup, `Unknown popup type: ${popup}`)
    }
  }

  private showAcknowledgements = () => {
    this.props.dispatcher.showPopup({ type: PopupType.Acknowledgements })
  }

  private showTermsAndConditions = () => {
    this.props.dispatcher.showPopup({ type: PopupType.TermsAndConditions })
  }

  private renderPopup() {
    return (
      <CSSTransitionGroup
        transitionName='modal'
        component='div'
        transitionEnterTimeout={dialogTransitionEnterTimeout}
        transitionLeaveTimeout={dialogTransitionLeaveTimeout}
      >
        {this.currentPopupContent()}
      </CSSTransitionGroup>
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
        {this.renderUpdateBanner()}
        {this.renderRepository()}
        {this.renderPopup()}
        {this.renderAppError()}
      </div>
    )
  }

  private renderRepositoryList = (): JSX.Element => {
    const selectedRepository = this.state.selectedState ? this.state.selectedState.repository : null
    return <RepositoriesList
      selectedRepository={selectedRepository}
      onSelectionChanged={this.onSelectionChanged}
      dispatcher={this.props.dispatcher}
      repositories={this.state.repositories}
      onRemoveRepository={this.removeRepository}
    />
  }

  private onRepositoryDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Repository })
      : this.props.dispatcher.closeFoldout(FoldoutType.Repository)
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
      title = __DARWIN__ ? 'Select a Repository' : 'Select a repository'
    }

    const isOpen = this.state.currentFoldout && this.state.currentFoldout.type === FoldoutType.Repository

    const currentState: DropdownState = isOpen ? 'open' : 'closed'

    const foldoutStyle: React.CSSProperties = {
      position: 'absolute',
      marginLeft: 0,
      minWidth: this.state.sidebarWidth,
      height: '100%',
      top: 0,
    }

    return <ToolbarDropdown
      icon={icon}
      title={title}
      description={__DARWIN__ ? 'Current Repository' : 'Current repository'}
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

    const state = selection.state
    const remoteName = state.remote ? state.remote.name : null
    const progress = state.pushPullFetchProgress

    return <PushPullButton
      dispatcher={this.props.dispatcher}
      repository={selection.repository}
      aheadBehind={state.aheadBehind}
      remoteName={remoteName}
      lastFetched={state.lastFetched}
      networkActionInProgress={state.isPushPullFetchInProgress}
      progress={progress}
    />
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

    return this.props.dispatcher.showPopup({ type: PopupType.CreateBranch, repository })
  }

  private onBranchDropdownStateChanged = (newState: DropdownState) => {
    newState === 'open'
      ? this.props.dispatcher.showFoldout({ type: FoldoutType.Branch })
      : this.props.dispatcher.closeFoldout(FoldoutType.Branch)
  }

  private renderBranchToolbarButton(): JSX.Element | null {
    const selection = this.state.selectedState

    if (!selection || selection.type !== SelectionType.Repository) {
      return null
    }

    const currentFoldout = this.state.currentFoldout
    const isOpen = !!currentFoldout && currentFoldout.type === FoldoutType.Branch

    return (
      <BranchDropdown
        dispatcher={this.props.dispatcher}
        isOpen={isOpen}
        onDropDownStateChanged={this.onBranchDropdownStateChanged}
        repository={selection.repository}
        repositoryState={selection.state}
      />
    )
  }

  private renderUpdateBanner() {
    if (!this.state.isUpdateAvailableBannerVisible) {
      return null
    }

    const releaseNotesUri = 'https://desktop.github.com/release-notes/'

    return (
      <UpdateAvailable
        releaseNotesLink={releaseNotesUri}
        onDismissed={this.onUpdateAvailableDismissed}/>
    )
  }

  private renderToolbar() {
    return (
      <Toolbar id='desktop-app-toolbar'>
        <div
          className='sidebar-section'
          style={{ width: this.state.sidebarWidth }}>
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
      return <BlankSlateView
        onCreate={this.showCreateRepository}
        onClone={this.showCloneRepo}
        onAdd={this.showAddLocalRepo}
      />
    }

    const selectedState = state.selectedState
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
                                    progress={selectedState.progress}/>
    } else if (selectedState.type === SelectionType.MissingRepository) {
      return <MissingRepository repository={selectedState.repository} dispatcher={this.props.dispatcher} accounts={this.state.accounts} />
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

    const className = this.state.appIsFocused
      ? 'focused'
      : 'blurred'

    return (
      <div id='desktop-app-chrome' className={className}>
        {this.renderTitlebar()}
        {this.state.showWelcomeFlow ? this.renderWelcomeFlow() : this.renderApp()}
      </div>
    )
  }

  private onSelectionChanged = (repository: Repository | CloningRepository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.closeFoldout(FoldoutType.Repository)
  }
}

function NoRepositorySelected() {
  return (
    <div className='panel blankslate'>
      No repository selected
    </div>
  )
}
