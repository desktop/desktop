import * as React from 'react'
import { WelcomeStep } from './welcome'
import { User } from '../../models/user'
import { ConfigureGitUser } from '../lib/configure-git-user'

interface IConfigureGitProps {
  readonly users: ReadonlyArray<User>
  readonly advance: (step: WelcomeStep) => void
  readonly done: () => void
}

/** The Welcome flow step to configure git. */
export class ConfigureGit extends React.Component<IConfigureGitProps, void> {
  public render() {
    return (
      <div id='configure-git'>
        <h1 className='welcome-title'>Configure Git</h1>
        <p className='welcome-text'>
          This is used to identify the commits you create. Anyone will be able to see this information if you publish commits.
        </p>

        <ConfigureGitUser users={this.props.users} onSave={this.done} saveLabel='Continue'>
          <button className='secondary-button' onClick={this.cancel}>Cancel</button>
        </ConfigureGitUser>
      </div>
    )
  }

  private done = () => {
    this.props.done()
  }

  private cancel = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()

    this.props.advance(WelcomeStep.Start)
  }
}
