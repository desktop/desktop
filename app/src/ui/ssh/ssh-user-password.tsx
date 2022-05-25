import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface ISSHUserPasswordProps {
  readonly username: string
  readonly onSubmit: (
    password: string | undefined,
    storePassword: boolean
  ) => void
  readonly onDismissed: () => void
}

interface ISSHUserPasswordState {
  readonly password: string
  readonly rememberPassword: boolean
}

/**
 * Dialog prompts the user the password of an SSH user.
 */
export class SSHUserPassword extends React.Component<
  ISSHUserPasswordProps,
  ISSHUserPasswordState
> {
  public constructor(props: ISSHUserPasswordProps) {
    super(props)
    this.state = { password: '', rememberPassword: false }
  }

  public render() {
    return (
      <Dialog
        id="ssh-user-password"
        type="normal"
        title="SSH User Password"
        dismissable={false}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              label={`Enter password for '${this.props.username}':`}
              value={this.state.password}
              type="password"
              onValueChanged={this.onValueChanged}
            />
          </Row>
          <Row>
            <Checkbox
              label="Remember password"
              value={
                this.state.rememberPassword
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onRememberPasswordChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            onCancelButtonClick={this.onCancel}
            okButtonDisabled={this.state.password.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onRememberPasswordChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ rememberPassword: event.currentTarget.checked })
  }

  private onValueChanged = (value: string) => {
    this.setState({ password: value })
  }

  private submit(password: string | undefined, storePassword: boolean) {
    const { onSubmit, onDismissed } = this.props

    onSubmit(password, storePassword)
    onDismissed()
  }

  private onSubmit = () => {
    this.submit(this.state.password, this.state.rememberPassword)
  }

  private onCancel = () => {
    this.submit(undefined, false)
  }
}
