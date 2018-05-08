import * as React from 'react'
import { remote } from 'electron'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Ref } from '../lib/ref'

interface ICreateSSHKeyProps {
  readonly initialPath: string
  readonly onDismissed: () => void
}

interface ICreateSSHKeyState {
  readonly emailAddress: string
  readonly passphrase: string
  readonly confirmPassPhrase: string
  readonly path: string
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
      confirmPassPhrase: '',
      path: props.initialPath,
    }
  }

  private onEmailAddressChanged = (emailAddress: string) => {
    this.setState({ emailAddress })
  }

  private onPassPhraseChanged = (passphrase: string) => {
    this.setState({ passphrase })
  }

  private onConfirmPassPhraseChanged = (confirmPassPhrase: string) => {
    this.setState({ confirmPassPhrase })
    // TODO: validate that the passphrase and text are the same
  }

  private onPathChanged = (path: string) => {
    this.setState({ path })
  }

  private showFilePicker = async () => {
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (!directory) {
      return
    }

    const path = directory[0]
    this.setState({ path })
  }

  private onCreateSSHKey = () => {}

  private renderErrorMessage = (): JSX.Element | null => {
    return null
  }

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
        {this.renderErrorMessage()}

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
            <span>
              A passphrase is recommended for extra security. Ensure that you
              remember this as{' '}
              <strong>
                a lost or forgotten passphrase cannot be recovered and a new key
                must be created
              </strong>.
            </span>
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
              value={this.state.confirmPassPhrase}
              onValueChanged={this.onConfirmPassPhraseChanged}
              type="password"
              label="Confirm passphrase"
            />
          </Row>
          <Row>
            <TextBox
              value={this.state.path}
              label={__DARWIN__ ? 'Local Path' : 'Local path'}
              placeholder="repository path"
              onValueChanged={this.onPathChanged}
            />
            <Button onClick={this.showFilePicker}>Choose…</Button>
          </Row>

          <Row>
            This will create an <Ref>RSA</Ref> key of <Ref>4096 bits</Ref>.
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
