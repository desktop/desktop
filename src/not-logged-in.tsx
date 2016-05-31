import * as React from 'react'

import {askUserToAuth, getDotComEndpoint} from './auth'

export default class NotLoggedIn extends React.Component<void, void> {
  public render() {
    return (
      <div>
        <div>You don't seem to be logged in.</div>
        <button onClick={() => askUserToAuth(getDotComEndpoint())}>Log In For Great Glory</button>
      </div>
    )
  }
}
