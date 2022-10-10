import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'
import { Checkbox, CheckboxValue } from '../lib/checkbox'

interface ISSHKeyPassphraseProps {
  readonly keyPath: string
  readonly onSubmit: (
    passphrase: string | undefined,
    storePassphrase: boolean
  ) => void
  readonly onDismissed: () => void
}

interface ISSHKeyPassphraseState {
  readonly passphrase: string
  readonly rememberPassphrase: boolean
}

/**
 * Dialog prompts the user the passphrase of an SSH key.
 */
export class SSHKeyPassphrase extends React.Component<
  ISSHKeyPassphraseProps,
  ISSHKeyPassphraseState
> {
  public constructor(props: ISSHKeyPassphraseProps) {
    super(props)
    this.state = { passphrase: '', rememberPassphrase: false }
  }

  public render() {
    return (
      <Dialog
        id="ssh-key-passphrase"
        type="normal"
        title="SSH Key Passphrase"
        dismissable={false}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <Row>
            <TextBox
              label={`Enter passphrase for key '${this.props.keyPath}':`}
              value={this.state.passphrase}
              type="password"
              onValueChanged={this.onValueChanged}
            />
          </Row>
          <Row>
            <Checkbox
              label="Remember passphrase"
              value={
                this.state.rememberPassphrase
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onRememberPassphraseChanged}
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            onCancelButtonClick={this.onCancel}
            okButtonDisabled={this.state.passphrase.length === 0}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onRememberPassphraseChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ rememberPassphrase: event.currentTarget.checked })
  }

  private onValueChanged = (value: string) => {
    this.setState({ passphrase: value })
  }

  private submit(passphrase: string | undefined, storePassphrase: boolean) {
    const { onSubmit, onDismissed } = this.props

    onSubmit(passphrase, storePassphrase)
    onDismissed()
  }

  private onSubmit = () => {
    this.submit(this.state.passphrase, this.state.rememberPassphrase)
  }

  private onCancel = () => {
    this.submit(undefined, false)
  }
}
