import * as React from 'react'

import {askUserToAuth} from './auth'

export default class NotLoggedIn extends React.Component<void, void> {
  public render() {
    return (
      <div>
        <div>You don't seem to be logged in.</div>
        <button onClick={() => askUserToAuth()}>Log In For Great Glory</button>
      </div>
    )
  }
}
