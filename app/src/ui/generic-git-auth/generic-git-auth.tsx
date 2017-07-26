import * as React from 'react'

import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Monospaced } from '../lib/monospaced'

interface IGenericGitAuthenticationProps {
  readonly hostname: string
  readonly onSave: (
    hostname: string,
    username: string,
    password: string
  ) => void
  readonly onDismiss: () => void
}

interface IGenericGitAuthenticationState {
  readonly username: string
  readonly password: string
}

/** Shown to enter the credentials to authenticate to a generic git server. */
export class GenericGitAuthentication extends React.Component<
  IGenericGitAuthenticationProps,
  IGenericGitAuthenticationState
> {
  public constructor(props: IGenericGitAuthenticationProps) {
    super(props)

    this.state = { username: '', password: '' }
  }

  public render() {
    return (
      <Dialog
        id="generic-git-auth"
        title={__DARWIN__ ? `Authentication Failed` : `Authentication failed`}
        onDismissed={this.props.onDismiss}
        onSubmit={this.save}
      >
        <DialogContent>
          <p>
            We were unable to authenticate with{' '}
            <Monospaced>{this.props.hostname}</Monospaced>. Please enter your
            username and password to try again.
          </p>

          <Row>
            <TextBox
              label="Username"
              autoFocus={true}
              value={this.state.username}
              onValueChanged={this.onUsernameChange}
            />
          </Row>

          <Row>
            <TextBox
              label="Password"
              type="password"
              value={this.state.password}
              onValueChanged={this.onPasswordChange}
            />
          </Row>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Save</Button>
            <Button onClick={this.props.onDismiss}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onUsernameChange = (value: string) => {
    this.setState({ username: value })
  }

  private onPasswordChange = (value: string) => {
    this.setState({ password: value })
  }

  private save = () => {
    this.props.onSave(
      this.props.hostname,
      this.state.username,
      this.state.password
    )
  }
}
