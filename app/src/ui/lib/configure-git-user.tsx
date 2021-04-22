import * as React from 'react'
import { Commit } from '../../models/commit'
import { lookupPreferredEmail } from '../../lib/email'
import {
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../lib/git/config'
import { CommitListItem } from '../history/commit-list-item'
import { Account } from '../../models/account'
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
import { getDotComAPIEndpoint } from '../../lib/api'

interface IConfigureGitUserProps {
  /** The logged-in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** Called after the user has chosen to save their config. */
  readonly onSave?: () => void

  /** The label for the button which saves config changes. */
  readonly saveLabel?: string
}

interface IConfigureGitUserState {
  readonly globalUserName: string | null
  readonly globalUserEmail: string | null

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
  private readonly globalUsernamePromise = getGlobalConfigValue('user.name')
  private readonly globalEmailPromise = getGlobalConfigValue('user.email')
  private loadInitialDataPromise: Promise<void> | null = null

  public constructor(props: IConfigureGitUserProps) {
    super(props)

    const account = this.account

    this.state = {
      globalUserName: null,
      globalUserEmail: null,
      manualName: '',
      manualEmail: '',
      useGitHubAuthorInfo: this.account !== null,
      gitHubName: account?.name || account?.login || '',
      gitHubEmail:
        this.account !== null ? lookupPreferredEmail(this.account) : '',
    }
  }

  public async componentDidMount() {
    this.loadInitialDataPromise = this.loadInitialData()
  }

  private async loadInitialData() {
    // Capture the current accounts prop because we'll be
    // doing a bunch of asynchronous stuff and we can't
    // rely on this.props.account to tell us what that prop
    // was at mount-time.
    const accounts = this.props.accounts

    const [globalUserName, globalUserEmail] = await Promise.all([
      this.globalUsernamePromise,
      this.globalEmailPromise,
    ])

    this.setState(
      prevState => ({
        globalUserName,
        globalUserEmail,
        manualName:
          prevState.manualName.length === 0
            ? globalUserName || ''
            : prevState.manualName,
        manualEmail:
          prevState.manualEmail.length === 0
            ? globalUserEmail || ''
            : prevState.manualEmail,
      }),
      () => {
        // Chances are low that we actually have an account at mount-time
        // the way things are designed now but in case the app changes around
        // us and we do get passed an account at mount time in the future we
        // want to make sure that not only was it passed at mount time but also
        // that it hasn't been changed since (if it has been then
        // componentDidUpdate would be responsible for handling it).
        if (accounts === this.props.accounts && accounts.length > 0) {
          this.setDefaultValuesFromAccount(accounts[0])
        }
      }
    )
  }

  public async componentDidUpdate(prevProps: IConfigureGitUserProps) {
    if (
      this.loadInitialDataPromise !== null &&
      this.props.accounts !== prevProps.accounts &&
      this.props.accounts.length > 0
    ) {
      if (this.props.accounts[0] !== prevProps.accounts[0]) {
        // Wait for the initial data load to finish before updating the state
        // with the new account info.
        // The problem is we might get the account info before we retrieved the
        // global user name and email in `loadInitialData` and updated the state
        // with them, so `componentDidUpdate` would get called and override
        // whatever the user had in the global git config with the account info.
        await this.loadInitialDataPromise

        const account = this.props.accounts[0]
        this.setDefaultValuesFromAccount(account)
      }
    }
  }

  private setDefaultValuesFromAccount(account: Account) {
    const preferredEmail = lookupPreferredEmail(account)
    this.setState({
      useGitHubAuthorInfo: true,
      gitHubName: account.name || account.login,
      gitHubEmail: preferredEmail,
    })

    if (this.state.manualName.length === 0) {
      this.setState({
        manualName: account.name || account.login,
      })
    }

    if (this.state.manualEmail.length === 0) {
      this.setState({ manualEmail: preferredEmail })
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

        {this.state.useGitHubAuthorInfo
          ? this.renderGitHubInfo()
          : this.renderGitConfigForm()}

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
          isLocal={false}
          showUnpushedIndicator={false}
          selectedCommits={[dummyCommit]}
        />
      </div>
    )
  }

  private renderAuthorOptions() {
    const account = this.account

    if (account === null) {
      return
    }

    const accountTypeSuffix =
      account.endpoint === getDotComAPIEndpoint() ? '' : ' Enterprise'

    return (
      <div>
        <RadioButton
          label={`Use my GitHub${accountTypeSuffix} account name and email address`}
          checked={this.state.useGitHubAuthorInfo}
          onSelected={this.onUseGitHubInfoSelected}
          value="github-account"
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
      <Form className="sign-in-form" onSubmit={this.save}>
        <TextBox
          label="Name"
          placeholder="Your Name"
          value={this.state.gitHubName}
          disabled={true}
        />

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

        <Row>
          <Button type="submit">{this.props.saveLabel || 'Save'}</Button>
          {this.props.children}
        </Row>
      </Form>
    )
  }

  private renderGitConfigForm() {
    return (
      <Form className="sign-in-form" onSubmit={this.save}>
        <TextBox
          label="Name"
          placeholder="Your Name"
          value={this.state.manualName}
          onValueChanged={this.onNameChange}
        />

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
      globalUserName,
      globalUserEmail,
      useGitHubAuthorInfo,
      gitHubName,
      gitHubEmail,
    } = this.state

    const name = useGitHubAuthorInfo ? gitHubName : manualName
    const email = useGitHubAuthorInfo ? gitHubEmail : manualEmail

    try {
      if (name.length > 0 && name !== globalUserName) {
        await setGlobalConfigValue('user.name', name)
      }

      if (email.length > 0 && email !== globalUserEmail) {
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
