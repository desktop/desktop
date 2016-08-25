import * as React from 'react'
import { ipcRenderer, remote } from 'electron'

import { Resizable } from './resizable'
import RepositoriesList from './repositories-list'
import { default as RepositoryView } from './repository'
import NotLoggedIn from './not-logged-in'
import { WindowControls } from './window/window-controls'
import { Dispatcher, AppStore, GitUserStore, CloningRepositoriesStore, CloningRepository } from '../lib/dispatcher'
import Repository from '../models/repository'
import { MenuEvent } from '../main-process/menu'
import fatalError from '../lib/fatal-error'
import { IAppState, RepositorySection, Popup } from '../lib/app-state'
import Popuppy from './popuppy'
import CreateBranch from './create-branch'
import Branches from './branches'
import AddRepository from './add-repository'
import PublishRepository from './publish-repository'

interface IAppProps {
  readonly dispatcher: Dispatcher
  readonly appStore: AppStore
  readonly gitUserStore: GitUserStore
  readonly cloningRepositoriesStore: CloningRepositoriesStore
}

export default class App extends React.Component<IAppProps, IAppState> {
  public constructor(props: IAppProps) {
    super(props)

    this.state = props.appStore.getState()
    props.appStore.onDidUpdate(state => {
      state.users.forEach(user => {
        // In theory a user should _always_ have an array of emails (even if
        // it's empty). But in practice, if the user had run old dev builds this
        // may not be the case. So for now we need to guard this. We should
        // remove this check in the not too distant future.
        // @joshaber (August 10, 2016)
        if (!user.emails) { return }

        const gitUsers = user.emails.map(email => {
          return {
            endpoint: user.endpoint,
            email,
            login: user.login,
            avatarURL: user.avatarURL,
          }
        })

        for (const user of gitUsers) {
          this.props.gitUserStore.cacheUser(user)
        }
      })

      this.setState(state)
    })

    props.cloningRepositoriesStore.onDidUpdate(() => {
      this.forceUpdate()
    })

    ipcRenderer.on('menu-event', (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => {
      this.onMenuEvent(name)
    })
  }

  private onMenuEvent(name: MenuEvent): any {
    switch (name) {
      case 'push': return this.push()
      case 'pull': return this.pull()
      case 'select-changes': return this.selectChanges()
      case 'select-history': return this.selectHistory()
      case 'add-local-repository': return this.showFileBrowser()
      case 'create-branch': return this.createBranch()
      case 'show-branches': return this.showBranches()
      case 'remove-repository': return this.removeRepository()
      case 'add-repository': return this.addRepository()
    }

    return fatalError(`Unknown menu event name: ${name}`)
  }

  private addRepository() {
    this.props.dispatcher.showPopup(Popup.AddRepository, null)
  }

  private createBranch() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.showPopup(Popup.CreateBranch, repository)
  }

  private showBranches() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.showPopup(Popup.ShowBranches, repository)
  }

  private selectChanges() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.changeRepositorySection(repository, RepositorySection.Changes)
  }

  private selectHistory() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.changeRepositorySection(repository, RepositorySection.History)
  }

  private push() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.push(repository)
  }

  private async pull() {
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    this.props.dispatcher.pull(repository)
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
    const repository = this.state.selectedRepository
    if (!repository || !(repository instanceof Repository)) { return }

    // TODO: remove cloning repository
    const repoID = repository.id
    this.props.dispatcher.removeRepositories([ repoID ])
  }

  private addRepositories(paths: string[]) {
    this.props.dispatcher.addRepositories(paths)
  }

  private renderTitlebar() {
    if (process.platform !== 'darwin' && process.platform !== 'win32') {
      return null
    }

    const winControls = process.platform === 'win32'
      ? <WindowControls />
      : null

    return (
      <div id='desktop-app-title-bar'>
        <span className='app-title'>GitHub Desktop</span>
        {winControls}
      </div>
    )
  }

  /** Put the main application menu into a context menu for now (win only) */
  private onContextMenu(e: React.MouseEvent<any>) {
    if (process.platform === 'win32') {
      e.preventDefault()
      ipcRenderer.send('show-popup-app-menu', null)
    }
  }

  private currentPopupContent(): JSX.Element | null {
    const popup = this.state.currentPopup
    if (!popup) { return null }

    switch (popup) {
      case Popup.CreateBranch: {
        const state = this.state.repositoryState!.branchesState
        const repository = this.state.selectedRepository! as Repository
        return <CreateBranch repository={repository}
                             dispatcher={this.props.dispatcher}
                             branches={state.allBranches}
                             currentBranch={state.currentBranch}/>
      }

      case Popup.ShowBranches: {
        const state = this.state.repositoryState!.branchesState
        const repository = this.state.selectedRepository! as Repository
        return <Branches allBranches={state.allBranches}
                         recentBranches={state.recentBranches}
                         currentBranch={state.currentBranch}
                         defaultBranch={state.defaultBranch}
                         dispatcher={this.props.dispatcher}
                         repository={repository}
                         commits={state.commits}/>
      }

      case Popup.AddRepository:
        return <AddRepository dispatcher={this.props.dispatcher}/>

      case Popup.PublishRepository:
        const repository = this.state.selectedRepository! as Repository
        return <PublishRepository repository={repository}
                                  dispatcher={this.props.dispatcher}
                                  users={this.props.appStore.getState().users}/>
    }

    return fatalError(`Unknown popup type: ${popup}`)
  }

  private renderPopup(): JSX.Element | null {
    const content = this.currentPopupContent()
    if (!content) { return null }

    return <Popuppy>{content}</Popuppy>
  }

  private renderErrors() {
    const errors = this.state.errors
    if (!errors.length) { return null }

    const clearErrors = () => {
      for (const error of Array.from(errors)) {
        this.props.dispatcher.clearError(error)
      }
    }

    const msgs = errors.map(e => e.message)
    return (
      <Popuppy>
        <div>{msgs.map(msg => <span>{msg}</span>)}</div>
        <button onClick={clearErrors}>OK</button>
      </Popuppy>
    )
  }

  private renderApp() {
    return (
      <div id='desktop-app-contents' onContextMenu={e => this.onContextMenu(e)}>
        <Resizable id='desktop-app-sidebar' configKey='repositories-list-width'>
          <RepositoriesList selectedRepository={this.state.selectedRepository}
                            onSelectionChanged={repository => this.onSelectionChanged(repository)}
                            dispatcher={this.props.dispatcher}
                            repositories={this.state.repositories}
                            cloningRepositories={this.props.cloningRepositoriesStore.repositories}
                            loading={this.state.loading}/>
        </Resizable>

        {this.renderRepository()}

        {this.renderPopup()}

        {this.renderErrors()}
      </div>
    )
  }

  private renderRepository() {
    const selectedRepository = this.state.selectedRepository
    if (selectedRepository instanceof Repository) {
      return (
        <RepositoryView repository={selectedRepository}
                        state={this.state.repositoryState!}
                        dispatcher={this.props.dispatcher}
                        gitUserStore={this.props.gitUserStore}/>
      )
    } else if (selectedRepository instanceof CloningRepository) {
      return <div>This repo is cloning!</div>
    } else {
      return <NoRepositorySelected/>
    }
  }

  private renderNotLoggedIn() {
    return (
      <div id='desktop-app-contents'>
        <NotLoggedIn dispatcher={this.props.dispatcher}/>
      </div>
    )
  }

  public render() {
    return (
      <div id='desktop-app-chrome'>
        {this.renderTitlebar()}
        {this.state.users.length > 0 ? this.renderApp() : this.renderNotLoggedIn()}
      </div>
    )
  }

  private onSelectionChanged(repository: Repository | CloningRepository) {
    this.props.dispatcher.selectRepository(repository)

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
