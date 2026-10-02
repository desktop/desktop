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
import { AccountPicker } from '../account-picker'
import { Row } from '../lib/row'

interface IPublishProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly accounts: ReadonlyArray<Account>
  readonly onDismissed: () => void
}

interface IPublishState {
  readonly selectedAccount: Account | null
  readonly settings: RepositoryPublicationSettings
  readonly error: Error | null
  readonly publishing: boolean
}

/** Publish a repository using one selected account across all GitHub hosts. */
export class Publish extends React.Component<IPublishProps, IPublishState> {
  public constructor(props: IPublishProps) {
    super(props)

    const associatedIdentity = props.repository.accountIdentity
    const associatedAccount =
      associatedIdentity === null || associatedIdentity === undefined
        ? null
        : props.accounts.find(
            account =>
              account.endpoint === associatedIdentity.endpoint &&
              account.id === associatedIdentity.id
          ) ?? null
    const selectedAccount =
      associatedAccount ??
      (associatedIdentity === null || associatedIdentity === undefined
        ? props.accounts.length === 1
          ? props.accounts[0]
          : null
        : null)

    this.state = {
      selectedAccount,
      settings: {
        kind:
          selectedAccount !== null && !isDotComAccount(selectedAccount)
            ? PublishSettingsType.enterprise
            : PublishSettingsType.dotcom,
        name: props.repository.name,
        description: '',
        private: true,
        org: null,
      },
      error: null,
      publishing: false,
    }
  }

  private getSelectedAccount(): Account | null {
    const selectedAccount = this.state.selectedAccount
    if (selectedAccount !== null) {
      return (
        this.props.accounts.find(account =>
          accountEquals(account, selectedAccount)
        ) ?? null
      )
    }

    if (
      (this.props.repository.accountIdentity === null ||
        this.props.repository.accountIdentity === undefined) &&
      this.props.accounts.length === 1
    ) {
      return this.props.accounts[0]
    }

    return null
  }

  public async componentDidMount() {
    try {
      const description = await getGitDescription(this.props.repository.path)
      this.setState(state => ({
        settings: { ...state.settings, description },
      }))
    } catch (error) {
      log.warn(`Couldn't get the repository's description`, error)
    }
  }

  private onSelectedAccountChanged = (account: Account) => {
    this.setState(state => ({
      selectedAccount: account,
      error: null,
      settings: {
        ...state.settings,
        kind: isDotComAccount(account)
          ? PublishSettingsType.dotcom
          : PublishSettingsType.enterprise,
        org: null,
      },
    }))
  }

  private onSettingsChanged = (settings: RepositoryPublicationSettings) => {
    this.setState({ settings })
  }

  private signInDotCom = () => {
    this.props.dispatcher.showDotComSignInDialog()
  }

  private renderContent() {
    if (this.props.accounts.length === 0) {
      const signInTitle = __DARWIN__ ? 'Sign In' : 'Sign in'
      return (
        <DialogContent>
          <CallToAction actionTitle={signInTitle} onAction={this.signInDotCom}>
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        </DialogContent>
      )
    }

    const account = this.getSelectedAccount()
    if (account === null) {
      return (
        <DialogContent>
          <Row>
            <AccountPicker
              accounts={this.props.accounts}
              selectedAccount={null}
              placeholder="Choose an account to publish"
              onSelectedAccountChanged={this.onSelectedAccountChanged}
              openButtonClassName="dialog-preferred-focus"
            />
          </Row>
        </DialogContent>
      )
    }

    return (
      <PublishRepository
        account={account}
        accounts={this.props.accounts}
        settings={this.state.settings}
        onSettingsChanged={this.onSettingsChanged}
        onSelectedAccountChanged={this.onSelectedAccountChanged}
      />
    )
  }

  private publishRepository = async () => {
    const account = this.getSelectedAccount()
    if (account === null) {
      this.setState({ error: new Error('Select an account to publish.') })
      return
    }

    this.setState({ error: null, publishing: true })
    const { settings } = this.state

    try {
      const publishedRepository = await this.props.dispatcher.publishRepository(
        this.props.repository,
        settings.name,
        settings.description,
        settings.private,
        account,
        settings.org
      )
      await this.props.dispatcher.setRepositoryAccount(
        publishedRepository,
        account
      )
      this.props.onDismissed()
    } catch (error) {
      this.setState({ error, publishing: false })
    }
  }

  public render() {
    const selectedAccount = this.getSelectedAccount()

    return (
      <Dialog
        id="publish-repository"
        title={__DARWIN__ ? 'Publish Repository' : 'Publish repository'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.publishRepository}
        disabled={this.state.publishing}
        loading={this.state.publishing}
      >
        {this.state.error !== null ? (
          <DialogError>{this.state.error.message}</DialogError>
        ) : null}
        {this.renderContent()}
        {this.props.accounts.length > 0 ? (
          <DialogFooter>
            <OkCancelButtonGroup
              okButtonText={
                __DARWIN__ ? 'Publish Repository' : 'Publish repository'
              }
              okButtonDisabled={
                selectedAccount === null ||
                this.state.settings.name.length === 0
              }
            />
          </DialogFooter>
        ) : null}
      </Dialog>
    )
  }
}
