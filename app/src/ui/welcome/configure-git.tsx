import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Account } from '../../models/account'
import { ConfigureGitUser } from '../lib/configure-git-user'
import { Button } from '../lib/button'

interface IConfigureGitProps {
  readonly accounts: ReadonlyArray<Account>
  readonly advance: (step: WelcomeStep) => void
}

/** The Welcome flow step to configure git. */
export class ConfigureGit extends React.Component<IConfigureGitProps, {}> {
  public render() {
    return (
      <div id="configure-git">
        <h1 className="welcome-title">Configure Git</h1>
        <p className="welcome-text">
          This is used to identify the commits you create. Anyone will be able
          to see this information if you publish commits.
        </p>

        <ConfigureGitUser
          accounts={this.props.accounts}
          onSave={this.continue}
          saveLabel="Continue"
        >
          <Button onClick={this.cancel}>Cancel</Button>
        </ConfigureGitUser>
      </div>
    )
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }

  private continue = () => {
    this.props.advance(WelcomeStep.UsageOptOut)
  }
}
