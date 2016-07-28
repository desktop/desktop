import * as React from 'react'
import { Dispatcher } from '../lib/dispatcher'

interface INotLoggedInProps {
  dispatcher: Dispatcher
}

export default class NotLoggedIn extends React.Component<INotLoggedInProps, void> {
  public render() {
    return (
      <div>
        <div>You don't seem to be logged in.</div>
        <button onClick={() => this.props.dispatcher.requestOAuth()}>Log In For Great Glory</button>
      </div>
    )
  }
}
