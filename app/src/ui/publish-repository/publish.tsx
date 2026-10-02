import * as React from 'react'
import { PublishRepository } from './publish-repository'
import { Dispatcher } from '../dispatcher'
import { Account, accountEquals, isDotComAccount } from '../../models/account'
import { Repository } from '../../models/repository'
import { Dialog, DialogFooter, DialogContent, DialogError } from '../dialog'
import { CallToAction } from '../lib/call-to-action'
import { getGitDescription } from '../../lib/git'
import {
  RepositoryPublicationSettings,
  PublishSettingsType,
} from '../../models/publish-settings'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in accounts. */
  readonly accounts: ReadonlyArray<Account>

  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

interface IPublishState {
  readonly selectedAccount: Account | null
  readonly settings: RepositoryPublicationSettings
  readonly error: Error | null

  /** Is the repository currently being published? */
  readonly publishing: boolean
}

/**
 * The Publish component.
 */
export class Publish extends React.Component<IPublishProps, IPublishState> {
  private mounted = false

  public constructor(props: IPublishProps) {
    super(props)
    const identity = props.repository.accountIdentity
    const associatedAccount =
      identity === null || identity === undefined
        ? null
        : props.accounts.find(
            account =>
              account.endpoint === identity.endpoint &&
              account.id === identity.id
          ) ?? null
    const selectedAccount =
      associatedAccount ??
      (props.accounts.length === 1 ? props.accounts[0] : null)
    const settings: RepositoryPublicationSettings = {
      name: props.repository.name,
      description: '',
      private: true,
      kind:
        selectedAccount !== null && !isDotComAccount(selectedAccount)
          ? PublishSettingsType.enterprise
          : PublishSettingsType.dotcom,
      org: null,
    }

    this.state = {
      selectedAccount,
      settings,
      error: null,
      publishing: false,
    }
  }

  public render() {
    return (
      <Dialog
        id="publish-repository"
        title={__DARWIN__ ? 'Publish Repository' : 'Publish repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.publishRepository}
        disabled={this.state.publishing}
        loading={this.state.publishing}
      >
        {this.state.error ? (
          <DialogError>{this.state.error.message}</DialogError>
        ) : null}

        <div>
          {this.renderContent()}
          {this.renderFooter()}
        </div>
      </Dialog>
    )
  }

  public async componentDidMount() {
    this.mounted = true
    try {
      const description = await getGitDescription(this.props.repository.path)
      if (this.mounted) {
        this.setState(state => ({
          settings: { ...state.settings, description },
        }))
      }
    } catch (error) {
      log.warn(`Couldn't get the repository's description`, error)
    }
  }

  public componentWillUnmount() {
    this.mounted = false
  }

  private renderContent() {
    const { selectedAccount } = this.state

    if (selectedAccount !== null) {
      return (
        <PublishRepository
          account={selectedAccount}
          accounts={this.props.accounts}
          settings={this.state.settings}
          onSettingsChanged={this.onSettingsChanged}
          onSelectedAccountChanged={this.onSelectedAccountChanged}
        />
      )
    } else if (this.props.accounts.length > 0) {
      return (
        <DialogContent>
          <label htmlFor="publish-account">Account</label>
          <select id="publish-account" value="" onChange={this.onAccountChoice}>
            <option value="">Choose an account</option>
            {this.props.accounts.map((account, index) => (
              <option key={`${account.endpoint}:${account.id}`} value={index}>
                @{account.login} — {account.friendlyEndpoint}
              </option>
            ))}
          </select>
        </DialogContent>
      )
    } else {
      return (
        <DialogContent>
          <CallToAction
            actionTitle={__DARWIN__ ? 'Sign In' : 'Sign in'}
            onAction={this.signInDotCom}
          >
            Sign in to your GitHub.com account to access your repositories.
          </CallToAction>
          <CallToAction
            actionTitle={
              __DARWIN__ ? 'Sign In to Enterprise' : 'Sign in to Enterprise'
            }
            onAction={this.signInEnterprise}
          >
            If you are using GitHub Enterprise at work, sign in to it to get
            access to your repositories.
          </CallToAction>
        </DialogContent>
      )
    }
  }

  public componentDidUpdate(prevProps: IPublishProps) {
    if (prevProps.accounts !== this.props.accounts) {
      const selected = this.state.selectedAccount
      const current =
        selected === null
          ? null
          : this.props.accounts.find(account =>
              accountEquals(account, selected)
            ) ?? null
      if (selected !== null && current === null) {
        this.setState({ selectedAccount: null })
      } else if (selected === null && this.props.accounts.length === 1) {
        this.onSelectedAccountChanged(this.props.accounts[0])
      } else if (current !== null && current !== selected) {
        this.setState({ selectedAccount: current })
      }
    }
  }

  private onAccountChoice = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const account = this.props.accounts[Number(event.currentTarget.value)]
    if (account !== undefined) {
      this.onSelectedAccountChanged(account)
    }
  }

  private onSelectedAccountChanged = (account: Account) => {
    this.setState(state => ({
      selectedAccount: account,
      settings: {
        ...state.settings,
        org: null,
        kind: isDotComAccount(account)
          ? PublishSettingsType.dotcom
          : PublishSettingsType.enterprise,
      },
      error: null,
    }))
  }

  private onSettingsChanged = (settings: RepositoryPublicationSettings) => {
    this.setState({ settings })
  }

  private renderFooter() {
    if (this.state.selectedAccount !== null) {
      return (
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={
              __DARWIN__ ? 'Publish Repository' : 'Publish repository'
            }
            okButtonDisabled={!this.state.settings.name.length}
          />
        </DialogFooter>
      )
    } else {
      return null
    }
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog(this.onSignInResult)
  }

  private signInEnterprise = () => {
    this.props.dispatcher.showEnterpriseSignInDialog(
      undefined,
      this.onSignInResult
    )
  }

  private onSignInResult = (
    result: { kind: 'success'; account: Account } | { kind: 'cancelled' }
  ) => {
    if (result.kind === 'success') {
      this.onSelectedAccountChanged(result.account)
    }
  }

  private publishRepository = async () => {
    const account = this.state.selectedAccount
    if (!account) {
      return
    }
    this.setState({ error: null, publishing: true })

    const settings = this.state.settings
    const { org } = settings

    try {
      await this.props.dispatcher.publishRepository(
        this.props.repository,
        settings.name,
        settings.description,
        settings.private,
        account,
        org
      )

      this.props.onDismissed()
    } catch (e) {
      this.setState({ error: e, publishing: false })
    }
  }
}
