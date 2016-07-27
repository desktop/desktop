import * as React from 'react'
import {ipcRenderer} from 'electron'

import {Sidebar} from './sidebar'
import RepositoriesList from './repositories-list'
import {default as RepositoryView} from './repository'
import User from '../models/user'
import GitHubRepository from '../models/github-repository'
import NotLoggedIn from './not-logged-in'
import {WindowControls} from './window/window-controls'
import {Dispatcher} from '../lib/dispatcher'
import Repository from '../models/repository'
import {matchGitHubRepository} from '../lib/repository-matching'
import API, {getUserForEndpoint} from '../lib/api'
import { LocalGitOperations } from '../lib/local-git-operations'
import { MenuEvent } from '../main-process/menu'
import fatalError from '../lib/fatal-error'

interface IAppState {
  readonly selectedRepository: Repository | null
  readonly repos: ReadonlyArray<Repository>
  readonly loadingRepos: boolean
  readonly users: ReadonlyArray<User>
}

interface IAppProps {
  readonly dispatcher: Dispatcher
}

export default class App extends React.Component<IAppProps, IAppState> {
  public constructor(props: IAppProps) {
    super(props)

    props.dispatcher.onDidUpdate(state => {
      this.update(state.users, state.repositories)
    })

    this.state = {
      selectedRepository: null,
      users: new Array<User>(),
      loadingRepos: true,
      repos: new Array<Repository>()
    }

    // This is split out simply because TS doesn't like having an async
    // constructor.
    this.fetchInitialState()

    ipcRenderer.on('menu-event', (event: Electron.IpcRendererEvent, { name }: { name: MenuEvent }) => this.onMenuEvent(name))
  }

  private onMenuEvent(name: MenuEvent): Promise<void> {
    switch (name) {
      case 'push': return this.push()
      case 'pull': return this.pull()
    }

    return fatalError(`Unknown menu event name: ${name}`)
  }

  private async push() {
    const repository = this.state.selectedRepository
    if (!repository) { return }

    const remote = await LocalGitOperations.getDefaultRemote(repository)
    if (!remote) {
      console.error('This repo has no remotes ¯\_(ツ)_/¯')
      return
    }

    const branch = await LocalGitOperations.getBranch(repository)
    if (!branch) {
      console.error('This repo is on an unborn branch ¯\_(ツ)_/¯')
      return
    }

    const trackingBranch = await LocalGitOperations.getTrackingBranch(repository)
    if (trackingBranch) {
      await LocalGitOperations.push(repository, remote, branch, false)
    } else {
      await LocalGitOperations.push(repository, remote, branch, true)
    }
  }

  private async pull() {
    const repository = this.state.selectedRepository
    if (!repository) { return }

    const remote = await LocalGitOperations.getDefaultRemote(repository)
    if (!remote) {
      console.error('This repo has no remotes ¯\_(ツ)_/¯')
      return
    }

    const branch = await LocalGitOperations.getBranch(repository)
    if (!branch) {
      console.error('This repo is on an unborn branch ¯\_(ツ)_/¯')
      return
    }

    await LocalGitOperations.pull(repository, remote, branch)
  }

  private async fetchInitialState() {
    const users = await this.props.dispatcher.getUsers()
    const repos = await this.props.dispatcher.getRepositories()
    this.update(users, repos)
  }

  private update(users: ReadonlyArray<User>, repos: ReadonlyArray<Repository>) {
    // TODO: We should persist this but for now we'll select the first
    // repository available unless we already have a selection
    const haveSelection = Boolean(this.state.selectedRepository)
    const selectedRepository = (!haveSelection && repos.length > 0) ? repos[0] : this.state.selectedRepository
    this.setState(Object.assign({}, this.state, {users, repos, loadingRepos: false, selectedRepository}))
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

  private async addRepositories(paths: string[]) {
    const repositories = paths.map(p => new Repository(p))
    const addedRepos = await this.props.dispatcher.addRepositories(repositories)

    addedRepos.forEach(repo => this.refreshGitHubRepositoryInfo(repo))
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
  private onContextMenu(e: React.MouseEvent) {
    if (process.platform === 'win32') {
      e.preventDefault()
      ipcRenderer.send('show-popup-app-menu', null)
    }
  }

  private renderApp() {
    const selectedRepository = this.state.selectedRepository!
    return (
      <div id='desktop-app-contents' onContextMenu={e => this.onContextMenu(e)}>
        <Sidebar>
          <RepositoriesList selectedRepository={selectedRepository}
                            onSelectionChanged={repository => this.onSelectionChanged(repository)}
                            repos={this.state.repos}
                            loading={this.state.loadingRepos}/>
        </Sidebar>
        <RepositoryView repo={selectedRepository} user={null}/>
      </div>
    )
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

  private refreshRepository(repository: Repository) {
    // This probably belongs in the Repository component or whatever, but until
    // that exists...
    console.log(repository)
    this.refreshGitHubRepositoryInfo(repository)
  }

  private onSelectionChanged(repository: Repository) {
    this.setState(Object.assign({}, this.state, {selectedRepository: repository}))

    this.refreshRepository(repository)
  }

  private async guessGitHubRepository(repository: Repository): Promise<GitHubRepository | null> {
    // TODO: This is all kinds of wrong. We shouldn't assume the remote is named
    // `origin`.
    const remote = await LocalGitOperations.getConfigValue(repository, 'remote.origin.url')
    if (!remote) { return null }

    return matchGitHubRepository(this.state.users, remote)
  }

  private async refreshGitHubRepositoryInfo(repository: Repository): Promise<void> {
    let gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      gitHubRepository = await this.guessGitHubRepository(repository)
    }

    if (!gitHubRepository) { return Promise.resolve() }

    const users = this.state.users
    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    if (!user) { return Promise.resolve() }

    const api = new API(user)
    const apiRepo = await api.fetchRepository(gitHubRepository.owner.login, gitHubRepository.name)

    const updatedRepository = repository.withGitHubRepository(gitHubRepository.withAPI(apiRepo))
    this.props.dispatcher.updateGitHubRepository(updatedRepository)
  }
}
