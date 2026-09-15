import * as React from 'react'
import { Commit } from '../../models/commit'
import { lookupPreferredEmail } from '../../lib/email'
import { setGlobalConfigValue } from '../../lib/git/config'
import { CommitListItem } from '../history/commit-list-item'
import { Account, isDotComAccount } from '../../models/account'
import { CommitIdentity } from '../../models/commit-identity'
import { Form } from '../lib/form'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'
import {
  isConfigFileLockError,
  parseConfigLockFilePathFromError,
} from '../../lib/git'
import { ConfigLockFileExists } from './config-lock-file-exists'
import { RadioButton } from './radio-button'
import { Select } from './select'
import { GitEmailNotFoundWarning } from './git-email-not-found-warning'

interface IConfigureGitUserProps {
  /** The logged-in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** Called after the user has chosen to save their config. */
  readonly onSave?: () => void

  /** The label for the button which saves config changes. */
  readonly saveLabel?: string

  readonly globalUserName: string | undefined
  readonly globalUserEmail: string | undefined
}

interface IConfigureGitUserState {
  readonly manualName: string
  readonly manualEmail: string

  readonly gitHubName: string
  readonly gitHubEmail: string

  readonly useGitHubAuthorInfo: boolean

  /**
   * If unable to save Git configuration values (name, email)
   * due to an existing configuration lock file this property
   * will contain the (fully qualified) path to said lock file
   * such that an error may be presented and the user given a
   * choice to delete the lock file.
   */
  readonly existingLockFilePath?: string
}

/**
 * A component which allows the user to configure their Git user.
 *
 * Provide `children` elements which will be rendered below the form.
 */
export class ConfigureGitUser extends React.Component<
  IConfigureGitUserProps,
  IConfigureGitUserState
> {
  public constructor(props: IConfigureGitUserProps) {
    super(props)

    const account = this.account
    const preferredEmail = account ? lookupPreferredEmail(account) : ''

    this.state = {
      manualName: props.globalUserName || account?.name || account?.login || '',
      manualEmail: props.globalUserEmail || preferredEmail,
      useGitHubAuthorInfo: this.account !== null,
      gitHubName: account?.name || account?.login || '',
      gitHubEmail: preferredEmail,
    }
  }

  public async componentDidUpdate(prevProps: IConfigureGitUserProps) {
    if (
      this.props.accounts !== prevProps.accounts &&
      this.props.accounts.length > 0
    ) {
      if (this.props.accounts[0] !== prevProps.accounts[0]) {
        const account = this.props.accounts[0]
        const preferredEmail = lookupPreferredEmail(account)

        this.setState({
          useGitHubAuthorInfo: true,
          gitHubName: account.name || account.login,
          gitHubEmail: preferredEmail,
          ...(this.state.manualName.length === 0
            ? { manualName: account.name || account.login }
            : { manualName: this.state.manualName }),
          ...(this.state.manualEmail.length === 0
            ? { manualEmail: preferredEmail }
            : { manualEmail: this.state.manualEmail }),
        })
      }
    }

    const { globalUserName, globalUserEmail } = this.props

    if (globalUserName && globalUserName !== prevProps.globalUserName) {
      this.setState(prevState => ({
        manualName: prevState.manualName || globalUserName,
      }))
    }

    if (globalUserEmail && globalUserEmail !== prevProps.globalUserEmail) {
      this.setState(prevState => ({
        manualEmail: prevState.manualEmail || globalUserEmail,
      }))
    }
  }

  private get account(): Account | null {
    if (this.props.accounts.length === 0) {
      return null
    }

    return this.props.accounts[0]
  }

  private dateWithMinuteOffset(date: Date, minuteOffset: number): Date {
    const copy = new Date(date.getTime())
    copy.setTime(copy.getTime() + minuteOffset * 60 * 1000)
    return copy
  }

  public render() {
    const error =
      this.state.existingLockFilePath !== undefined ? (
        <ConfigLockFileExists
          lockFilePath={this.state.existingLockFilePath}
          onLockFileDeleted={this.onLockFileDeleted}
          onError={this.onLockFileDeleteError}
        />
      ) : null

    return (
      <div id="configure-git-user">
        {this.renderAuthorOptions()}

        {error}

        {this.renderConfigForm()}

        {this.renderExampleCommit()}
      </div>
    )
  }

  private renderExampleCommit() {
    const now = new Date()

    let name = this.state.manualName
    let email = this.state.manualEmail

    if (this.state.useGitHubAuthorInfo) {
      name = this.state.gitHubName
      email = this.state.gitHubEmail
    }

    // NB: We're using the name as the commit SHA:
    //  1. `Commit` is referentially transparent wrt the SHA. So in order to get
    //     it to update when we name changes, we need to change the SHA.
    //  2. We don't display the SHA so the user won't ever know our secret.
    const author = new CommitIdentity(
      name,
      email,
      this.dateWithMinuteOffset(now, -30)
    )
    const dummyCommit = new Commit(
      name,
      name.slice(0, 7),
      'Fix all the things',
      '',
      author,
      author,
      [],
      [],
      []
    )
    const emoji = new Map()

    return (
      <div id="commit-list" className="commit-list-example">
        <div className="header">Example commit</div>

        <CommitListItem
          commit={dummyCommit}
          emoji={emoji}
          gitHubRepository={null}
          showUnpushedIndicator={false}
          selectedCommits={[dummyCommit]}
          accounts={this.props.accounts}
          preferAbsoluteDates={false}
        />
      </div>
    )
  }

  private renderAuthorOptions() {
    const account = this.account

    if (account === null) {
      return
    }

    const accountTypeSuffix = isDotComAccount(account) ? '' : ' Enterprise'

    return (
      <div>
        <RadioButton
          label={`Use my GitHub${accountTypeSuffix} account name and email address`}
          checked={this.state.useGitHubAuthorInfo}
          onSelected={this.onUseGitHubInfoSelected}
          value="github-account"
          autoFocus={true}
        />
        <RadioButton
          label="Configure manually"
          checked={!this.state.useGitHubAuthorInfo}
          onSelected={this.onUseGitConfigInfoSelected}
          value="git-config"
        />
      </div>
    )
  }

  private renderGitHubInfo() {
    if (this.account === null) {
      return
    }

    return (
      <>
        <Select
          label="Email"
          value={this.state.gitHubEmail}
          onChange={this.onSelectedGitHubEmailChange}
        >
          {this.account.emails.map(e => (
            <option key={e.email} value={e.email}>
              {e.email}
            </option>
          ))}
        </Select>
      </>
    )
  }

  private renderGitConfigForm() {
    return (
      <>
        <TextBox
          type="email"
          label="Email"
          placeholder="your-email@example.com"
          value={this.state.manualEmail}
          onValueChanged={this.onEmailChange}
        />

        {this.account !== null && (
          <GitEmailNotFoundWarning
            accounts={[this.account]}
            email={this.state.manualEmail}
          />
        )}
      </>
    )
  }

  private renderConfigForm() {
    return (
      <Form className="sign-in-form" onSubmit={this.save}>
        <div className="sign-in-form-inputs">
          <TextBox
            label="Name"
            placeholder="Your Name"
            onValueChanged={this.onNameChange}
            value={
              this.state.useGitHubAuthorInfo
                ? this.state.gitHubName
                : this.state.manualName
            }
            readOnly={this.state.useGitHubAuthorInfo}
            autoFocus={true}
          />

          {this.state.useGitHubAuthorInfo
            ? this.renderGitHubInfo()
            : this.renderGitConfigForm()}
        </div>
        <Row>
          <Button type="submit">{this.props.saveLabel || 'Save'}</Button>
          {this.props.children}
        </Row>
      </Form>
    )
  }

  private onSelectedGitHubEmailChange = (
    event: React.FormEvent<HTMLSelectElement>
  ) => {
    const email = event.currentTarget.value
    if (email) {
      this.setState({ gitHubEmail: email })
    }
  }

  private onLockFileDeleted = () => {
    this.setState({ existingLockFilePath: undefined })
  }

  private onLockFileDeleteError = (e: Error) => {
    log.error('Failed to unlink config lock file', e)
    this.setState({ existingLockFilePath: undefined })
  }

  private onUseGitHubInfoSelected = () => {
    this.setState({ useGitHubAuthorInfo: true })
  }

  private onUseGitConfigInfoSelected = () => {
    this.setState({ useGitHubAuthorInfo: false })
  }

  private onNameChange = (name: string) => {
    this.setState({ manualName: name })
  }

  private onEmailChange = (email: string) => {
    this.setState({ manualEmail: email })
  }

  private save = async () => {
    const {
      manualName,
      manualEmail,
      useGitHubAuthorInfo,
      gitHubName,
      gitHubEmail,
    } = this.state

    const name = useGitHubAuthorInfo ? gitHubName : manualName
    const email = useGitHubAuthorInfo ? gitHubEmail : manualEmail

    try {
      if (name.length > 0 && name !== this.props.globalUserName) {
        await setGlobalConfigValue('user.name', name)
      }

      if (email.length > 0 && email !== this.props.globalUserEmail) {
        await setGlobalConfigValue('user.email', email)
      }
    } catch (e) {
      if (isConfigFileLockError(e)) {
        const lockFilePath = parseConfigLockFilePathFromError(e.result)

        if (lockFilePath !== null) {
          this.setState({ existingLockFilePath: lockFilePath })
          return
        }
      }
    }

    if (this.props.onSave) {
      this.props.onSave()
    }
  }
}
