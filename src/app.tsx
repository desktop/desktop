import * as React from 'react'
import ThingList from './thing-list'
import Info from './info'
import UsersStore from './users-store'
import User from './user'
import NotLoggedIn from './not-logged-in'

interface AppState {
  selectedRow: number,
  user: User
}

interface AppProps {
  usersStore: UsersStore
}

const AppStyle = {
  display: 'flex',
  flexDirection: 'column',
  flexGrow: 1
}

const ContentStyle = {
  display: 'flex',
  flexDirection: 'row',
  flexGrow: 1
}

export default class App extends React.Component<AppProps, AppState> {
  public constructor(props: AppProps) {
    super(props)

    props.usersStore.onUsersChanged(users => {
      this.setState({selectedRow: this.state.selectedRow, user: users[0]})
    })

    this.state = {selectedRow: -1, user: props.usersStore.getUsers()[0]}
  }

  private renderTitlebar() {
    if (process.platform !== 'darwin') {
      return null
    }

    return (
      <div style={{
        WebkitAppRegion: 'drag',
        flexShrink: 0,
        height: 20,
        width: '100%'
      }}/>
    )
  }

  public render() {
    return (
      <div style={AppStyle}>
        {this.renderTitlebar()}
        <div style={ContentStyle}>
          <ThingList selectedRow={this.state.selectedRow} onSelectionChanged={row => this.handleSelectionChanged(row)}/>
          {this.state.user ? <Info selectedRow={this.state.selectedRow} user={this.state.user}/> : <NotLoggedIn/>}
        </div>
      </div>
    )
  }

  private handleSelectionChanged(row: number) {
    this.setState({selectedRow: row, user: this.state.user})
  }
}
