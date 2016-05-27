import * as React from 'react'
import ThingList from './thing-list'
import Info from './info'
import UsersStore from './users-store'
import User from './user'
import NotLoggedIn from './not-logged-in'

type AppState = {
  selectedRow: number,
  user: User
}

type AppProps = {
  usersStore: UsersStore,
  style?: Object
}

const AppStyle = {
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

  public render() {
    const completeStyle = Object.assign({}, this.props.style, AppStyle)
    return (
      <div style={completeStyle}>
        <ThingList selectedRow={this.state.selectedRow} onSelectionChanged={row => this.handleSelectionChanged(row)}/>
        {this.state.user ? <Info selectedRow={this.state.selectedRow} user={this.state.user}/> : <NotLoggedIn/>}
      </div>
    )
  }

  private handleSelectionChanged(row: number) {
    this.setState({selectedRow: row, user: this.state.user})
  }
}
