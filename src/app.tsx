import * as React from 'react'
import {ipcRenderer} from 'electron'

import ReposList from './repos-list'
import Info from './info'
import User from './models/user'
import NotLoggedIn from './not-logged-in'
import {WindowControls} from './ui/window/window-controls'
import API from './lib/api'
import {Repo} from './lib/api'
import Dispatcher from './dispatcher'

interface AppState {
  selectedRow: number,
  repos: Repo[],
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
      const user = state.users[0]
      this.api = new API(user)
      this.setState(Object.assign({}, this.state, {user}))
      this.fetchRepos()
    })

    this.state = {
      selectedRow: -1,
      user: null,
      loadingRepos: true,
      repos: []
    }

    this.setup()
  }

  private async setup() {
    const users = await this.props.dispatcher.getUsers()
    const user = users[0]
    this.setState(Object.assign({}, this.state, {user}))

    if (user) {
      this.api = new API(user)
      this.fetchRepos()
    }
  }

  private async fetchRepos() {
    const repos = await this.api.fetchRepos()
    this.setState(Object.assign({}, this.state, {
      loadingRepos: false,
      repos
    }))
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
        <ReposList selectedRow={this.state.selectedRow}
                   onSelectionChanged={row => this.handleSelectionChanged(row)}
                   user={this.state.user}
                   repos={this.state.repos}
                   loading={this.state.loadingRepos}/>
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
