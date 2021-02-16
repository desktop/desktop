import * as React from 'react'
import { DialogContent } from '../dialog'
import { Account } from '../../models/account'
import { GitConfigUserForm } from '../lib/git-config-user-form'
import { getDotComAPIEndpoint } from '../../lib/api'
import { Row } from '../lib/row'
import { RadioButton } from '../lib/radio-button'

interface IGitConfigProps {
  readonly account: Account | null

  readonly gitConfigLocation: GitConfigLocation
  readonly name: string
  readonly email: string
  readonly globalName: string
  readonly globalEmail: string

  readonly onGitConfigLocationChanged: (value: GitConfigLocation) => void
  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
}

export enum GitConfigLocation {
  Global = 'Global',
  Local = 'Local',
}

/** A view for creating or modifying the repository's gitignore file */
export class GitConfig extends React.Component<IGitConfigProps> {
  private onGitConfigLocationChanged = (value: GitConfigLocation) => {
    this.props.onGitConfigLocationChanged(value)
  }

  public render() {
    const isDotComAccount =
      this.props.account !== null &&
      this.props.account.endpoint === getDotComAPIEndpoint()
    const enterpriseAccount = isDotComAccount ? null : this.props.account
    const dotComAccount = isDotComAccount ? this.props.account : null

    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>For this repository I wish to</h2>
          <Row>
            <div>
              <RadioButton
                label="Use my global Git config"
                checked={
                  this.props.gitConfigLocation === GitConfigLocation.Global
                }
                value={GitConfigLocation.Global}
                onSelected={this.onGitConfigLocationChanged}
              />
              <RadioButton
                label="Use a local Git config"
                checked={
                  this.props.gitConfigLocation === GitConfigLocation.Local
                }
                value={GitConfigLocation.Local}
                onSelected={this.onGitConfigLocationChanged}
              />
            </div>
          </Row>
          <GitConfigUserForm
            email={
              this.props.gitConfigLocation === GitConfigLocation.Global
                ? this.props.globalEmail
                : this.props.email
            }
            name={
              this.props.gitConfigLocation === GitConfigLocation.Global
                ? this.props.globalName
                : this.props.name
            }
            enterpriseAccount={enterpriseAccount}
            dotComAccount={dotComAccount}
            disabled={this.props.gitConfigLocation === GitConfigLocation.Global}
            onEmailChanged={this.props.onEmailChanged}
            onNameChanged={this.props.onNameChanged}
          />
        </div>
      </DialogContent>
    )
  }
}
