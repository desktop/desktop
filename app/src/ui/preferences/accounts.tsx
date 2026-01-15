import * as React from 'react'
import {
  Account,
  isDotComAccount,
  isEnterpriseAccount,
} from '../../models/account'
import { IAvatarUser } from '../../models/avatar'
import { lookupPreferredEmail } from '../../lib/email'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { DialogContent, DialogPreferredFocusClassName } from '../dialog'
import { Avatar } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'
import { enableMultipleEnterpriseAccounts } from '../../lib/feature-flag'
import { getHTMLURL } from '../../lib/api'

interface IAccountsProps {
  readonly accounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (account: Account) => void
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, {}> {
  /**
   * Renders the accounts preferences tab content.
   *
   * With multi-account support, this will display all GitHub.com accounts
   * with individual sign-out buttons, plus an "Add Another Account" button.
   */
  public render() {
    const { accounts } = this.props
    // Get all GitHub.com accounts (multi-account support)
    const dotComAccounts = accounts.filter(isDotComAccount)

    return (
      <DialogContent className="accounts-tab">
        <h2>GitHub.com</h2>
        {dotComAccounts.length > 0
          ? this.renderDotComAccounts(dotComAccounts)
          : this.renderSignIn(SignInType.DotCom)}

        <h2>GitHub Enterprise</h2>
        {enableMultipleEnterpriseAccounts()
          ? this.renderMultipleEnterpriseAccounts()
          : this.renderSingleEnterpriseAccount()}
      </DialogContent>
    )
  }

  /**
   * Renders all GitHub.com accounts with an "Add Another Account" button.
   *
   * This enables multi-account support where users can have multiple
   * GitHub.com accounts signed in simultaneously (e.g., personal and work).
   *
   * @param accounts All GitHub.com accounts to display
   */
  private renderDotComAccounts(accounts: ReadonlyArray<Account>) {
    return (
      <>
        {accounts.map((account, index) => (
          <React.Fragment key={`${account.endpoint}:${account.id}`}>
            {this.renderAccount(account, SignInType.DotCom, index === 0)}
          </React.Fragment>
        ))}
        <Button onClick={this.onDotComSignIn}>
          {__DARWIN__ ? 'Add Another GitHub.com Account' : 'Add another GitHub.com account'}
        </Button>
      </>
    )
  }

  private renderSingleEnterpriseAccount() {
    const enterpriseAccount = this.props.accounts.find(isEnterpriseAccount)

    return enterpriseAccount
      ? this.renderAccount(enterpriseAccount, SignInType.Enterprise)
      : this.renderSignIn(SignInType.Enterprise)
  }

  private renderMultipleEnterpriseAccounts() {
    const enterpriseAccounts = this.props.accounts.filter(isEnterpriseAccount)

    return (
      <>
        {enterpriseAccounts.map(account => {
          return this.renderAccount(account, SignInType.Enterprise)
        })}
        {enterpriseAccounts.length === 0 ? (
          this.renderSignIn(SignInType.Enterprise)
        ) : (
          <Button onClick={this.props.onEnterpriseSignIn}>
            Add GitHub Enteprise account
          </Button>
        )}
      </>
    )
  }

  /**
   * Renders a single account row with avatar, info, and sign-out button.
   *
   * @param account The account to render
   * @param type The type of account (DotCom or Enterprise)
   * @param isFirst Whether this is the first account (for focus handling)
   */
  private renderAccount(
    account: Account,
    type: SignInType,
    isFirst: boolean = true
  ) {
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    // The first DotCom account is shown first, so its sign out button should be
    // focused initially when the dialog is opened.
    const className =
      type === SignInType.DotCom && isFirst
        ? DialogPreferredFocusClassName
        : undefined

    return (
      <Row className="account-info">
        <div className="user-info-container">
          <Avatar accounts={this.props.accounts} user={avatarUser} />
          <div className="user-info">
            {enableMultipleEnterpriseAccounts() &&
            isEnterpriseAccount(account) ? (
              <>
                <div className="account-title">
                  {account.name === account.login
                    ? `@${account.login}`
                    : `@${account.login} (${account.name})`}
                </div>
                <div className="endpoint">{getHTMLURL(account.endpoint)}</div>
              </>
            ) : (
              <>
                <div className="name">{account.name}</div>
                <div className="login">@{account.login}</div>
              </>
            )}
          </div>
        </div>
        <Button onClick={this.logout(account)} className={className}>
          {__DARWIN__ ? 'Sign Out' : 'Sign out'}
        </Button>
      </Row>
    )
  }

  private onDotComSignIn = () => {
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = () => {
    this.props.onEnterpriseSignIn()
  }

  private renderSignIn(type: SignInType) {
    const signInTitle = __DARWIN__ ? 'Sign Into' : 'Sign into'
    switch (type) {
      case SignInType.DotCom: {
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub.com'}
            onAction={this.onDotComSignIn}
            // The DotCom account is shown first, so its sign in/out button should be
            // focused initially when the dialog is opened.
            buttonClassName={DialogPreferredFocusClassName}
          >
            <div>
              Sign in to your GitHub.com account to access your repositories.
            </div>
          </CallToAction>
        )
      }
      case SignInType.Enterprise:
        return (
          <CallToAction
            actionTitle={signInTitle + ' GitHub Enterprise'}
            onAction={this.onEnterpriseSignIn}
          >
            <div>
              If you are using GitHub Enterprise at work, sign in to it to get
              access to your repositories.
            </div>
          </CallToAction>
        )
      default:
        return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private logout = (account: Account) => {
    return () => {
      this.props.onLogout(account)
    }
  }
}
