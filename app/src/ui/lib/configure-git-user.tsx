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

  readonly name: string
  readonly email: string
  readonly avatarURL: string | null

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

  public constructor(props: IConfigureGitUserProps) {
    super(props)

    this.state = {
      globalUserName: null,
      globalUserEmail: null,
      name: '',
      email: '',
      avatarURL: null,
    }
  }

  public async componentDidMount() {
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
        name:
          prevState.name.length === 0 ? globalUserName || '' : prevState.name,
        email:
          prevState.email.length === 0
            ? globalUserEmail || ''
            : prevState.email,
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

  public componentDidUpdate(prevProps: IConfigureGitUserProps) {
    if (
      this.props.accounts !== prevProps.accounts &&
      this.props.accounts.length > 0
    ) {
      if (this.props.accounts[0] !== prevProps.accounts[0]) {
        const account = this.props.accounts[0]
        this.setDefaultValuesFromAccount(account)
      }
    }
  }

  private setDefaultValuesFromAccount(account: Account) {
    if (this.state.name.length === 0) {
      this.setState({
        name: account.name || account.login,
      })
    }

    if (this.state.email.length === 0) {
      this.setState({ email: lookupPreferredEmail(account) })
    }
  }

  private dateWithMinuteOffset(date: Date, minuteOffset: number): Date {
    const copy = new Date(date.getTime())
    copy.setTime(copy.getTime() + minuteOffset * 60 * 1000)
    return copy
  }

  public render() {
    const now = new Date()

    // NB: We're using the name as the commit SHA:
    //  1. `Commit` is referentially transparent wrt the SHA. So in order to get
    //     it to update when we name changes, we need to change the SHA.
    //  2. We don't display the SHA so the user won't ever know our secret.
    const author = new CommitIdentity(
      this.state.name,
      this.state.email,
      this.dateWithMinuteOffset(now, -30)
    )
    const dummyCommit = new Commit(
      this.state.name,
      this.state.name.slice(0, 7),
      'Fix all the things',
      '',
      author,
      author,
      [],
      [],
      []
    )
    const emoji = new Map()

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
        {error}

        <Form className="sign-in-form" onSubmit={this.save}>
          <TextBox
            label="Name"
            placeholder="Your Name"
            value={this.state.name}
            onValueChanged={this.onNameChange}
          />

          <TextBox
            label="Email"
            placeholder="your-email@example.com"
            value={this.state.email}
            onValueChanged={this.onEmailChange}
          />

          <Row>
            <Button type="submit">{this.props.saveLabel || 'Save'}</Button>
            {this.props.children}
          </Row>
        </Form>

        <div id="commit-list" className="commit-list-example">
          <div className="header">Example commit</div>

          <CommitListItem
            commit={dummyCommit}
            emoji={emoji}
            gitHubRepository={null}
            isLocal={false}
            showUnpushedIndicator={false}
          />
        </div>
      </div>
    )
  }

  private onLockFileDeleted = () => {
    this.setState({ existingLockFilePath: undefined })
  }

  private onLockFileDeleteError = (e: Error) => {
    log.error('Failed to unlink config lock file', e)
    this.setState({ existingLockFilePath: undefined })
  }

  private onNameChange = (name: string) => {
    this.setState({ name })
  }

  private onEmailChange = (email: string) => {
    this.setState({ email })
  }

  private save = async () => {
    const { name, email, globalUserName, globalUserEmail } = this.state

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
