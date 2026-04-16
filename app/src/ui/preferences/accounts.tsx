import * as React from 'react'
import {
  Account,
  accountEquals,
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
import { getHTMLURL } from '../../lib/api'

interface IAccountsProps {
  readonly accounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onSetActiveAccount: (account: Account) => void
  readonly onLogout: (account: Account) => void
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, {}> {
  public render() {
    const { accounts } = this.props
    const dotComAccounts = accounts.filter(isDotComAccount)

    return (
      <DialogContent className="accounts-tab">
        <h2>GitHub.com</h2>
        {this.renderAccountsSection(dotComAccounts, SignInType.DotCom)}

        <h2>GitHub Enterprise</h2>
        {this.renderAccountsSection(
          accounts.filter(isEnterpriseAccount),
          SignInType.Enterprise
        )}
      </DialogContent>
    )
  }

  private renderAccountsSection(
    accounts: ReadonlyArray<Account>,
    type: SignInType
  ) {
    if (accounts.length === 0) {
      return this.renderSignIn(type)
    }

    return (
      <>
        {accounts.map(account =>
          this.renderAccount(
            account,
            type,
            this.isActiveAccount(account, accounts)
          )
        )}
        <Button onClick={this.getAddAccountHandler(type)}>
          {type === SignInType.DotCom
            ? 'Add GitHub.com account'
            : 'Add GitHub Enterprise account'}
        </Button>
      </>
    )
  }

  private isActiveAccount(
    account: Account,
    accounts: ReadonlyArray<Account>
  ): boolean {
    const activeAccount = accounts.find(a => a.endpoint === account.endpoint)
    return activeAccount !== undefined && accountEquals(activeAccount, account)
  }

  private renderAccount(account: Account, type: SignInType, isActive: boolean) {
    const avatarUser: IAvatarUser = {
      name: account.name,
      email: lookupPreferredEmail(account),
      avatarURL: account.avatarURL,
      endpoint: account.endpoint,
    }

    // The DotCom account is shown first, so its sign in/out button should be
    // focused initially when the dialog is opened.
    const className =
      type === SignInType.DotCom && isActive
        ? DialogPreferredFocusClassName
        : undefined

    return (
      <Row className="account-info">
        <div className="user-info-container">
          <Avatar accounts={this.props.accounts} user={avatarUser} />
          <div className="user-info">
            {isEnterpriseAccount(account) ? (
              <>
                <div className="account-title">
                  {account.name === account.login
                    ? `@${account.login}`
                    : `@${account.login} (${account.name})`}
                </div>
                <div className="endpoint">{getHTMLURL(account.endpoint)}</div>
                {isActive ? (
                  <div className="account-status">Active account</div>
                ) : null}
              </>
            ) : (
              <>
                <div className="name">{account.name}</div>
                <div className="login">@{account.login}</div>
                {isActive ? (
                  <div className="account-status">Active account</div>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="account-actions">
          {!isActive ? (
            <Button onClick={this.activate(account)}>Set Active</Button>
          ) : null}
          <Button onClick={this.logout(account)} className={className}>
            {__DARWIN__ ? 'Sign Out' : 'Sign out'}
          </Button>
        </div>
      </Row>
    )
  }

  private onDotComSignIn = () => {
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = () => {
    this.props.onEnterpriseSignIn()
  }

  private getAddAccountHandler(type: SignInType) {
    return type === SignInType.DotCom
      ? this.onDotComSignIn
      : this.onEnterpriseSignIn
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

  private activate = (account: Account) => {
    return () => {
      this.props.onSetActiveAccount(account)
    }
  }
}
