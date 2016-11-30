import * as React from 'react'
import { ConfigureGit } from '../lib/configure-git'

export class Git extends React.Component<void, void> {
  public render() {
    return (
      <div>
        <h2>Git!!!!</h2>

        <ConfigureGit/>
      </div>
    )
  }
}
