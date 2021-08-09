import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Row } from '../lib/row'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { TextBox } from '../lib/text-box'

interface ISSHKeyPassphraseProps {
  readonly keyPath: string
  readonly onSubmit: (passphrase: string | undefined) => void
  readonly onDismissed: () => void
}

interface ISSHKeyPassphraseState {
  readonly passphrase: string
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
    this.state = { passphrase: '' }
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

  private onValueChanged = (value: string) => {
    this.setState({ passphrase: value })
  }

  private submit(passphrase: string | undefined) {
    const { onSubmit, onDismissed } = this.props

    onSubmit(passphrase)
    onDismissed()
  }

  private onSubmit = () => {
    this.submit(this.state.passphrase)
  }

  private onCancel = () => {
    this.submit(undefined)
  }
}
