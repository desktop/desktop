import * as React from 'react'
import { ConfigureGitUser } from '../lib/configure-git-user'
import { User } from '../../models/user'

interface IGitProps {
  readonly users: ReadonlyArray<User>
}

export class Git extends React.Component<IGitProps, void> {
  public render() {
    return (
      <div>
        <ConfigureGitUser users={this.props.users}/>
      </div>
    )
  }
}
