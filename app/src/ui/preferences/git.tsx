import * as React from 'react'
import { ConfigureGit } from '../lib/configure-git'
import { User } from '../../models/user'

interface IGitProps {
  readonly users: ReadonlyArray<User>
}

export class Git extends React.Component<IGitProps, void> {
  public render() {
    return (
      <div>
        <ConfigureGit users={this.props.users}/>
      </div>
    )
  }
}
