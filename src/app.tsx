import * as React from 'react'
import {ipcRenderer} from 'electron'
import {Repository as GitRepository} from 'ohnogit'

import ReposList from './repos-list'
import Info from './info'
import User from './models/user'
import GitHubRepository from './models/github-repository'
import NotLoggedIn from './not-logged-in'
import {WindowControls} from './ui/window/window-controls'
import Dispatcher from './dispatcher'
import Repository from './models/repository'
import {matchGitHubRepository} from './lib/repository-matching'

interface AppState {
  selectedRow: number
  repos: Repository[]
  loadingRepos: boolean
  users: User[]
}

interface AppProps {
  dispatcher: Dispatcher
}

export default class App extends React.Component<AppProps, AppState> {
  public constructor(props: AppProps) {
    super(props)

    props.dispatcher.onDidUpdate(state => {
      this.update(state.users, state.repositories)
    })

    this.state = {
      selectedRow: -1,
      users: [],
      loadingRepos: true,
      repos: []
    }

    // This is split out simply because TS doesn't like having an async
    // constructor.
    this.fetchInitialState()
  }

  private async fetchInitialState() {
    const users = await this.props.dispatcher.getUsers()
    const repos = await this.props.dispatcher.getRepositories()
    this.update(users, repos)
  }

  private update(users: User[], repos: Repository[]) {
    // TODO: We should persist this but for now we'll select the first
    // repository available unless we already have a selection
    const haveSelection = this.state.selectedRow > -1
    const selectedRow = (!haveSelection && repos.length > 0) ? 0 : this.state.selectedRow

    if (haveSelection) {
      // This is less than ideal but works for now.
      this.refreshSelectedRepository()
    }

    this.setState(Object.assign({}, this.state, {users, repos, loadingRepos: false, selectedRow}))
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
    const repositories: Repository[] = []
    for (let path of paths) {
      const gitRepo = GitRepository.open(path)
      // TODO: This is all kinds of wrong.
      const remote = await gitRepo.getConfigValue('remote.origin.url')
      let gitHubRepository: GitHubRepository = null
      if (remote) {
        gitHubRepository = matchGitHubRepository(this.state.users, remote)
      }

      if (gitHubRepository) {
        console.log(`Matched ${remote} to ${gitHubRepository.getOwner().getLogin()}/${gitHubRepository.getName()}`)
      }

      const repository = new Repository(path, gitHubRepository)
      repositories.push(repository)
    }

    this.props.dispatcher.addRepositories(repositories)
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

  /* Put the main application menu into a context menu for now (win only)
   */
  private onContextMenu(e: React.MouseEvent) {
    if (process.platform === 'win32') {
      e.preventDefault()
      ipcRenderer.send('show-popup-app-menu', null)
    }
  }

  private renderApp() {
    const selectedRepo = this.state.repos[this.state.selectedRow]
    return (
      <div id='desktop-app-contents' onContextMenu={e => this.onContextMenu(e)}>
        <div id='desktop-app-sidebar'>
          <ReposList selectedRow={this.state.selectedRow}
                     onSelectionChanged={row => this.handleSelectionChanged(row)}
                     repos={this.state.repos}
                     loading={this.state.loadingRepos}/>
        </div>
        <Info selectedRepo={selectedRepo}/>
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

  private refreshSelectedRepository() {
    // This probably belongs in the Repository component or whatever, but until
    // that exists...
    const repo = this.state.repos[this.state.selectedRow]
    this.props.dispatcher.refreshRepository(repo)
  }

  private handleSelectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))

    this.refreshSelectedRepository()
  }
}
