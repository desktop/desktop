import * as React from 'react'

import { Repository } from '../../models/repository'

import { Welcome } from './welcome'

interface ITroubleshootSSHProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}

export class TroubleshootSSH extends React.Component<
  ITroubleshootSSHProps,
  {}
> {
  public render() {
    return (
      <Welcome
        repository={this.props.repository}
        onDismissed={this.props.onDismissed}
      />
    )
  }
}
