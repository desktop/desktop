import * as React from 'react'
import ReposList from './repos-list'
import Info from './info'
import UsersStore from './users-store'
import User from './user'
import NotLoggedIn from './not-logged-in'
import API from './lib/api'
import {Repo} from './lib/api'

interface AppState {
  selectedRow: number,
  repos: Repo[],
  loadingRepos: boolean,
  user: User
}

interface AppProps {
  usersStore: UsersStore,
  style?: Object
}

const AppStyle = {
  display: 'flex',
  flexDirection: 'row',
  flexGrow: 1
}

export default class App extends React.Component<AppProps, AppState> {
  private api: API

  public constructor(props: AppProps) {
    super(props)

    props.usersStore.onUsersChanged(users => {
      const user = users[0]
      this.api = new API(user)
      this.setState(Object.assign({}, this.state, {user}))
      this.fetchRepos()
    })

    const user = props.usersStore.getUsers()[0]
    this.state = {
      selectedRow: -1,
      user,
      loadingRepos: true,
      repos: []
    }

    if (user) {
      this.api = new API(user)
    }
  }

  private async fetchRepos() {
    const repos = await this.api.fetchRepos()
    this.setState(Object.assign({}, this.state, {
      loadingRepos: false,
      repos
    }))
  }

  public async componentWillMount() {
    if (this.api) {
      this.fetchRepos()
    }
  }

  public render() {
    const completeStyle = Object.assign({}, this.props.style, AppStyle)
    if (!this.state.user) {
      return (
        <div style={completeStyle}>
          <NotLoggedIn/>
        </div>
      )
    }

    const selectedRepo = this.state.repos[this.state.selectedRow]
    return (
      <div style={completeStyle}>
        <ReposList selectedRow={this.state.selectedRow}
                   onSelectionChanged={row => this.handleSelectionChanged(row)}
                   user={this.state.user}
                   repos={this.state.repos}
                   loading={this.state.loadingRepos}/>
        <Info selectedRepo={selectedRepo} user={this.state.user}/>
      </div>
    )
  }

  private handleSelectionChanged(row: number) {
    this.setState(Object.assign({}, this.state, {selectedRow: row}))
  }
}
