import * as React from 'react'
import { remote } from 'electron'
import * as os from 'os'
import * as Path from 'path'

import { lookupPreferredEmail } from '../../lib/email'
import { IAvatarUser } from '../../models/avatar'
import { Account, accountHasScope } from '../../models/account'

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
import { pathExists } from 'fs-extra'
import { OcticonSymbol, Octicon } from '../octicons'

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
  readonly outputFileExists: boolean | null
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
      outputFileExists: null,
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

  private updateFile = async (outputFile: string) => {
    const outputFileExists = await pathExists(outputFile)
    this.setState({ outputFile, outputFileExists })
  }

  private showFilePicker = async () => {
    const defaultPath = this.state.outputFile
    const window: any = null
    remote.dialog.showSaveDialog(
      window,
      {
        defaultPath,
      },
      async outputFile => {
        if (outputFile == null) {
          return
        }

        await this.updateFile(outputFile)
      }
    )
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

  private updateState = async (selectedAccount: number) => {
    // TODO: validate that this is an entry in the array
    const account = this.props.state.accounts[selectedAccount]
    const outputFile = getPathForNewSSHKey(`github_desktop_${account.login}`)

    await this.updateFile(outputFile)

    const email = lookupPreferredEmail(account.emails)
    const emailAddress = email == null ? '' : email.email
    this.setState({ selectedAccount, emailAddress })
  }

  private onAccountSelectionChanged = (rows: ReadonlyArray<number>) => {
    this.updateState(rows[0])
  }

  private onAccountRowClick = (row: number) => {
    this.updateState(row)
  }

  private onPathChanged = async (outputFile: string) => {
    await this.updateFile(outputFile)
  }

  private renderTokenWarning(account: Account) {
    if (accountHasScope(account, 'write:public_key')) {
      return null
    }

    return (
      <div
        className="token-alert"
        title="The token for this account needs to be upgraded to publish your SSH key"
      >
        <Octicon symbol={OcticonSymbol.alert} />
      </div>
    )
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
        {this.renderTokenWarning(account)}
      </Row>
    )
  }

  private renderPasswordMismatch = () => {
    if (this.state.passphrase === this.state.confirmPassPhrase) {
      return null
    }

    return (
      <Row className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />
        <p>The passphrase and confirmed passphrase do not match.</p>
      </Row>
    )
  }

  private renderExistingKeyWarning = () => {
    if (!this.state.outputFileExists) {
      return null
    }

    return (
      <Row className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />
        <p>
          A file already exists at this path. Choose a new path to ensure that
          you don't overwrite an existing key.
        </p>
      </Row>
    )
  }

  public render() {
    const isLoading = this.props.state.isLoading

    const passphraseMatches =
      this.state.passphrase === this.state.confirmPassPhrase

    const disabled =
      this.state.selectedAccount == null ||
      !passphraseMatches ||
      this.state.outputFileExists ||
      isLoading

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

          {this.renderPasswordMismatch()}

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

          {this.renderExistingKeyWarning()}

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
