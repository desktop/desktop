import * as React from 'react'
import { getDotComAPIEndpoint } from '../../lib/api'
import { caseInsensitiveEquals } from '../../lib/compare'
import { SignInResult } from '../../lib/stores/sign-in-store'
import { Account } from '../../models/account'
import { PopupType } from '../../models/popup'
import { RepositoryWithGitHubRepository } from '../../models/repository'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Select } from '../lib/select'

interface IRepositoryAccountDialogProps {
  readonly repository: RepositoryWithGitHubRepository
  readonly accounts: ReadonlyArray<Account>
  readonly dispatcher: Dispatcher
  readonly onComplete: (account: Account | undefined) => void
  readonly onDismissed: () => void
}

interface IRepositoryAccountDialogState {
  readonly choosingAnotherAccount: boolean
  readonly selectedAccount: Account | undefined
}

/** Requests an identity for a repository without persisting the choice. */
export class RepositoryAccountDialog extends React.Component<
  IRepositoryAccountDialogProps,
  IRepositoryAccountDialogState
> {
  public constructor(props: IRepositoryAccountDialogProps) {
    super(props)
    this.state = {
      choosingAnotherAccount: false,
      selectedAccount: undefined,
    }
  }

  private get endpoint() {
    return this.props.repository.gitHubRepository.endpoint
  }

  private get requiresSignIn() {
    const login = this.props.repository.login
    return (
      !this.state.choosingAnotherAccount &&
      login !== null &&
      !this.props.accounts.some(
        a =>
          a.endpoint === this.endpoint && caseInsensitiveEquals(a.login, login)
      )
    )
  }

  private complete = (account: Account | undefined) => {
    this.props.onComplete(account)
    this.props.onDismissed()
  }

  private onDismissed = () => this.complete(undefined)

  private onChooseAnotherAccount = () => {
    this.setState({ choosingAnotherAccount: true })
  }

  private onAccountChanged = (event: React.FormEvent<HTMLSelectElement>) => {
    const login = event.currentTarget.value
    this.setState({
      selectedAccount: this.accounts.find(a => a.login === login),
    })
  }

  private onSignInResult = (result: SignInResult) => {
    if (result.kind !== 'success') {
      return
    }

    this.props.dispatcher.closePopup(PopupType.SignIn)
    if (result.account.endpoint !== this.endpoint) {
      return
    }

    this.setState({ selectedAccount: result.account })
  }

  private onAssignedAccountSignInResult = (result: SignInResult) => {
    if (result.kind !== 'success') {
      return
    }

    this.props.dispatcher.closePopup(PopupType.SignIn)
    if (
      result.account.endpoint === this.endpoint &&
      this.props.repository.login !== null &&
      caseInsensitiveEquals(result.account.login, this.props.repository.login)
    ) {
      this.complete(result.account)
    }
  }

  private onSignIn = () => {
    const { dispatcher, repository } = this.props
    if (this.requiresSignIn && repository.login !== null) {
      dispatcher.showAccountSignInDialog(
        this.endpoint,
        repository.login,
        this.onAssignedAccountSignInResult
      )
    } else if (this.endpoint === getDotComAPIEndpoint()) {
      dispatcher.showDotComSignInDialog(this.onSignInResult)
    } else {
      dispatcher.showEnterpriseSignInDialog(this.endpoint, this.onSignInResult)
    }
  }

  private onSubmit = () => {
    if (this.requiresSignIn) {
      this.onSignIn()
    } else if (this.state.selectedAccount !== undefined) {
      this.complete(this.state.selectedAccount)
    }
  }

  private get accounts() {
    const accounts = this.props.accounts.filter(
      a => a.endpoint === this.endpoint
    )
    const selected = this.state.selectedAccount
    // Sign-in can finish before the updated accounts reach this dialog.
    return selected !== undefined &&
      !accounts.some(a => a.login === selected.login)
      ? [...accounts, selected]
      : accounts
  }

  public render() {
    const requiresSignIn = this.requiresSignIn
    return (
      <Dialog
        id="repository-account"
        title="Repository account"
        onDismissed={this.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          {requiresSignIn ? (
            <>
              <p>
                {this.props.repository.name} is assigned to @
                {this.props.repository.login} on {this.endpoint}. Sign in to
                continue using this account.
              </p>
              <Button onClick={this.onChooseAnotherAccount}>
                Choose another account
              </Button>
            </>
          ) : (
            <>
              <p>
                Choose the account to use for GitHub API requests and HTTPS
                authentication for {this.props.repository.name} on{' '}
                {this.endpoint}. This does not change your Git author name or
                email.
              </p>
              <Select
                label="Account"
                value={this.state.selectedAccount?.login ?? ''}
                onChange={this.onAccountChanged}
              >
                <option value="">Choose an account</option>
                {this.accounts.map(account => (
                  <option key={account.login} value={account.login}>
                    @{account.login}
                  </option>
                ))}
              </Select>
              <Button onClick={this.onSignIn}>
                Sign in to another account
              </Button>
            </>
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={requiresSignIn ? 'Sign in' : 'Use account'}
            okButtonDisabled={
              !requiresSignIn && this.state.selectedAccount === undefined
            }
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
