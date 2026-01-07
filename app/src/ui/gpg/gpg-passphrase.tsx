import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { PasswordTextBox } from '../lib/password-text-box'

interface IGPGPassphraseProps {
  readonly keyId: string
  readonly onSubmit: (
    passphrase: string | undefined,
    storePassphrase: boolean
  ) => void
  readonly onDismissed: () => void
}

interface IGPGPassphraseState {
  readonly passphrase: string
  readonly rememberPassphrase: boolean
}

/**
 * Dialog prompts the user for the passphrase of a GPG key.
 */
export class GPGPassphrase extends React.Component<
  IGPGPassphraseProps,
  IGPGPassphraseState
> {
  public constructor(props: IGPGPassphraseProps) {
    super(props)
    this.state = { passphrase: '', rememberPassphrase: false }
  }

  public render() {
    return (
      <Dialog
        id="gpg-passphrase"
        type="normal"
        title="GPG Key Passphrase"
        backdropDismissable={false}
        onSubmit={this.onSubmit}
        onDismissed={this.onCancel}
      >
        <DialogContent>
          <Row>
            <PasswordTextBox
              label={`Enter passphrase for GPG key '${this.props.keyId}':`}
              value={this.state.passphrase}
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
