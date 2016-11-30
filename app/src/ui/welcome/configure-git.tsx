import * as React from 'react'
import { WelcomeStep } from './welcome'
import { User } from '../../models/user'
import { ConfigureGit as ConfigureGitComponent } from '../lib/configure-git'

interface IConfigureGitProps {
  readonly users: ReadonlyArray<User>
  readonly advance: (step: WelcomeStep) => void
  readonly done: () => void
}

/** The Welcome flow step to configure git. */
export class ConfigureGit extends React.Component<IConfigureGitProps, void> {
  public render() {
    return (
      <ConfigureGitComponent users={this.props.users} done={this.done} cancel={this.cancel} doneLabel='Continue'/>
    )
  }

  private done = () => {
    this.props.done()
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }
}
