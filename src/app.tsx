import * as React from 'react'
import {ipcRenderer} from 'electron'

import ReposList from './repos-list'
import Info from './info'
import User from './models/user'
import NotLoggedIn from './not-logged-in'
import {WindowControls} from './ui/window/window-controls'
import API from './lib/api'
import Dispatcher from './dispatcher'
import Repository from './models/repository'

interface AppState {
  selectedRow: number,
  repos: Repository[],
  loadingRepos: boolean,
  user: User
}

interface AppProps {
  dispatcher: Dispatcher
}

export default class App extends React.Component<AppProps, AppState> {
  private api: API

  public constructor(props: AppProps) {
    super(props)

    props.dispatcher.onDidUpdate(state => {
      this.update(state.users, state.repositories)
    })

    this.state = {
      selectedRow: -1,
      user: null,
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
    const user = users[0]
    // TODO: We should persist this but for now we'll select the first
    // repository available unless we already have a selection
    const selectedRow = (this.state.selectedRow === -1 && repos.length > 0) ? 0 : -1

    this.setState(Object.assign({}, this.state, {user, repos, loadingRepos: false, selectedRow}))

    if (user) {
      this.api = new API(user)
    }
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

  private handleDragAndDrop(files: FileList) {
    const repositories: Repository[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      // TODO: Ensure it's actually a git repository.
      // TODO: Look up its GitHub repository.
      const repo = new Repository(file.path, null)
      repositories.push(repo)
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
                     user={this.state.user}
                     repos={this.state.repos}
                     loading={this.state.loadingRepos}/>
          <div className='resize-handle'></div>
        </div>
        <Info selectedRepo={selectedRepo} user={this.state.user}/>
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
        {this.state.user ? this.renderApp() : this.renderNotLoggedIn()}
      </div>
    )
  }

  private handleSelectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))
  }
}
