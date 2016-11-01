import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'

interface IConfigureGitProps {
  readonly dispatcher: Dispatcher
  readonly advance: () => void
  readonly cancel: () => void
}

export class ConfigureGit extends React.Component<IConfigureGitProps, void> {
  public render() {
    return (
      <div></div>
    )
  }
}
