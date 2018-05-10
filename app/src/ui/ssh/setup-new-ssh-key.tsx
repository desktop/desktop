import * as React from 'react'
import { remote } from 'electron'
import * as os from 'os'
import * as Path from 'path'

import { lookupPreferredEmail } from '../../lib/email'
import { IAvatarUser } from '../../models/avatar'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { Ref } from '../lib/ref'

import { Avatar } from '../lib/avatar'
import { Loading } from '../lib/loading'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { List } from '../lib/list'
import { Dispatcher } from '../../lib/dispatcher'
import { ICreateSSHKeyState } from '../../models/ssh'

function getPathForNewSSHKey(fileName: string) {
  const homeDir = os.homedir()
  return Path.join(homeDir, '.ssh', fileName)
}

interface ISetupNewSSHKeyProps {
  readonly dispatcher: Dispatcher
  readonly state: ICreateSSHKeyState
  readonly onDismissed: () => void
}

interface ISetupNewSSHKeyState {
  readonly selectedAccount?: number
  readonly emailAddress: string
  readonly passphrase: string
  readonly confirmPassPhrase: string
  readonly outputFile: string
}

export class SetupNewSSHKey extends React.Component<
  ISetupNewSSHKeyProps,
  ISetupNewSSHKeyState
> {
  public constructor(props: ISetupNewSSHKeyProps) {
    super(props)

    this.state = {
      emailAddress: '',
      passphrase: '',
      confirmPassPhrase: '',
      outputFile: getPathForNewSSHKey('github_desktop'),
    }
  }

  private onContinue = () => {
    if (this.state.selectedAccount == null) {
      return
    }

    const account = this.props.state.accounts[this.state.selectedAccount]

    this.props.dispatcher.createSSHKey(
      account,
      this.state.emailAddress,
      this.state.passphrase,
      this.state.outputFile
    )
  }

  private showFilePicker = async () => {
    // TODO: this needs to be a file chooser
    const directory: string[] | null = remote.dialog.showOpenDialog({
      properties: ['createDirectory', 'openDirectory'],
    })

    if (directory == null) {
      return
    }

    const outputFile = directory[0]
    this.setState({ outputFile })
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

  private updateState = (selectedAccount: number) => {
    // TODO: validate that this is an entry in the array
    const account = this.props.state.accounts[selectedAccount]
    const outputFile = getPathForNewSSHKey(`github_desktop_${account.login}`)

    const email = lookupPreferredEmail(account.emails)
    const emailAddress = email == null ? '' : email.email
    this.setState({ selectedAccount, outputFile, emailAddress })
  }

  private onAccountSelectionChanged = (rows: ReadonlyArray<number>) => {
    this.updateState(rows[0])
  }

  private onAccountRowClick = (row: number) => {
    this.updateState(row)
  }

  private onPathChanged = (outputFile: string) => {
    this.setState({ outputFile })
  }

  private renderRow = (index: number) => {
    const account = this.props.state.accounts[index]

    const found = lookupPreferredEmail(account.emails)
    const email = found ? found.email : ''

    const avatarUser: IAvatarUser = {
      name: account.name,
      email: email,
      avatarURL: account.avatarURL,
    }

    return (
      <Row className="account-info">
        <Avatar user={avatarUser} />
        <div className="user-info">
          <div className="name">{account.name}</div>
          <div className="login">@{account.login}</div>
        </div>
      </Row>
    )
  }

  public render() {
    const isLoading = this.props.state.isLoading
    // TODO: other validation rules here
    const disabled = this.state.selectedAccount == null || isLoading

    const selectedRows =
      this.state.selectedAccount == null ? [] : [this.state.selectedAccount]

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Create SSH Key"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onContinue}
      >
        <DialogContent>
          <Row>Choose an account to associate with the new SSH key:</Row>

          <Row>
            <div className="account-list-container">
              <List
                rowRenderer={this.renderRow}
                rowCount={this.props.state.accounts.length}
                rowHeight={34}
                selectedRows={selectedRows}
                selectionMode="single"
                invalidationProps={this.props.state.accounts}
                onSelectionChanged={this.onAccountSelectionChanged}
                onRowClick={this.onAccountRowClick}
              />
            </div>
          </Row>
          <Row>
            <TextBox
              value={this.state.emailAddress}
              onValueChanged={this.onEmailAddressChanged}
              disabled={isLoading}
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
              disabled={isLoading}
              type="password"
              label="Passphrase (optional)"
            />
          </Row>
          <Row>
            <TextBox
              value={this.state.confirmPassPhrase}
              onValueChanged={this.onConfirmPassPhraseChanged}
              disabled={isLoading}
              type="password"
              label="Confirm passphrase"
            />
          </Row>
          <Row>
            <TextBox
              value={this.state.outputFile}
              disabled={isLoading}
              onValueChanged={this.onPathChanged}
              label={__DARWIN__ ? 'Key Path' : 'Key path'}
              placeholder="SSH key path"
            />
            <Button onClick={this.showFilePicker} disabled={isLoading}>
              Choose…
            </Button>
          </Row>

          <Row>
            This will create an <Ref>RSA</Ref> key of <Ref>4096 bits</Ref>.
          </Row>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {isLoading ? <Loading /> : null}
              Create
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
