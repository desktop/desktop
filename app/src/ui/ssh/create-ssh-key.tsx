import * as React from 'react'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface ICreateSSHKeyProps {
  readonly onDismissed: () => void
}

interface ICreateSSHKeyState {
  readonly emailAddress: string
  readonly passphrase: string
}

export class CreateSSHKey extends React.Component<
  ICreateSSHKeyProps,
  ICreateSSHKeyState
> {
  public constructor(props: ICreateSSHKeyProps) {
    super(props)

    this.state = {
      emailAddress: '',
      passphrase: '',
    }
  }

  private onEmailAddressChanged = (emailAddress: string) => {
    this.setState({ emailAddress })
  }

  private onPassPhraseChanged = (passphrase: string) => {
    this.setState({ passphrase })
  }

  private onConfirmPassPhraseChanged = (passphrase: string) => {
    // TODO: validate that the passphrase adn text are the same
  }

  private onCreateSSHKey = () => {}

  public render() {
    // TODO: how can we validate this and ensure we don't submit at the wrong time
    const disabled = false

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Create SSH Key"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onCreateSSHKey}
      >
        <DialogContent>
          <Row>
            No existing SSH keys were found on this machine.To create one, fill
            out these details:
          </Row>
          <Row>
            <TextBox
              value={this.state.emailAddress}
              onValueChanged={this.onEmailAddressChanged}
              autoFocus={true}
              label="Email address (required)"
            />
          </Row>
          <Row>
            <TextBox
              value={this.state.passphrase}
              onValueChanged={this.onPassPhraseChanged}
              type="password"
              label="Passphrase (optional)"
            />
          </Row>
          <Row>
            <TextBox
              value={this.state.emailAddress}
              onValueChanged={this.onConfirmPassPhraseChanged}
              type="password"
              label="Confirm passphrase"
            />
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button disabled={disabled} type="submit">
              Create
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
