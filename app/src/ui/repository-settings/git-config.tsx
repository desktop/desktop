import * as React from 'react'
import { DialogContent } from '../dialog'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

interface IGitConfigProps {
  readonly gitConfigLocation: GitConfigLocation
  readonly name: string
  readonly email: string
  readonly globalName: string
  readonly globalEmail: string

  readonly onGitConfigLocationChanged: (value: GitConfigLocation) => void
  readonly onNameChanged: (name: string) => void
  readonly onEmailChanged: (email: string) => void
}

interface IGitConfigState {
  readonly gitConfigLocation: GitConfigLocation
}

export enum GitConfigLocation {
  Global = 'Global',
  Local = 'Local',
}

/** A view for creating or modifying the repository's gitignore file */
export class GitConfig extends React.Component<
  IGitConfigProps,
  IGitConfigState
> {
  public constructor(props: IGitConfigProps) {
    super(props)

    this.state = {
      gitConfigLocation: this.props.gitConfigLocation,
    }
  }
  private onGitConfigLocationChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = event.currentTarget.value as GitConfigLocation

    this.setState({ gitConfigLocation: value })
    this.props.onGitConfigLocationChanged(value)
  }

  public render() {
    return (
      <DialogContent>
        <div className="advanced-section">
          <h2>For this repository I wish to</h2>
          <div className="radio-component">
            <input
              type="radio"
              id={GitConfigLocation.Global}
              value={GitConfigLocation.Global}
              checked={
                this.state.gitConfigLocation === GitConfigLocation.Global
              }
              onChange={this.onGitConfigLocationChanged}
            />
            <label htmlFor={GitConfigLocation.Global}>
              Use my global Git config
            </label>
          </div>
          <div className="radio-component">
            <input
              type="radio"
              id={GitConfigLocation.Local}
              value={GitConfigLocation.Local}
              checked={this.state.gitConfigLocation === GitConfigLocation.Local}
              onChange={this.onGitConfigLocationChanged}
            />
            <label htmlFor={GitConfigLocation.Local}>
              Use a local Git config
            </label>
          </div>
        </div>
        <Row>
          <TextBox
            label="Name"
            value={
              this.state.gitConfigLocation === GitConfigLocation.Global
                ? this.props.globalName
                : this.props.name
            }
            onValueChanged={this.props.onNameChanged}
            disabled={this.state.gitConfigLocation === GitConfigLocation.Global}
          />
        </Row>
        <Row>
          <TextBox
            label="Email"
            value={
              this.state.gitConfigLocation === GitConfigLocation.Global
                ? this.props.globalEmail
                : this.props.email
            }
            onValueChanged={this.props.onEmailChanged}
            disabled={this.state.gitConfigLocation === GitConfigLocation.Global}
          />
        </Row>
      </DialogContent>
    )
  }
}
