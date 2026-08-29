import * as React from 'react'
import {
  Account,
  accountEquals,
  IAccountMetadata,
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
  readonly accounts: ReadonlyArray<IAccountMetadata>
  readonly activeAccounts: ReadonlyArray<Account>

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onSetActiveAccount: (account: IAccountMetadata) => void
  readonly onLogout: (account: IAccountMetadata) => void
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
        {this.renderAccounts(dotComAccounts, SignInType.DotCom)}

        <h2>GitHub Enterprise</h2>
        {this.renderAccounts(
          accounts.filter(isEnterpriseAccount),
          SignInType.Enterprise
        )}
      </DialogContent>
    )
  }

  private renderAccounts(
    accounts: ReadonlyArray<IAccountMetadata>,
    type: SignInType
  ) {
    if (accounts.length === 0) {
      return this.renderSignIn(type)
    }

    return (
      <>
        {accounts.map(account => this.renderAccount(account, type))}
        <Button onClick={this.getSignInHandler(type)}>
          {type === SignInType.DotCom
            ? 'Add GitHub.com account'
            : 'Add GitHub Enterprise account'}
        </Button>
      </>
    )
  }

  private renderAccount(account: IAccountMetadata, type: SignInType) {
    const isActive = this.props.activeAccounts.some(activeAccount =>
      accountEquals(activeAccount, account)
    )
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
      <Row className="account-info" key={`${account.endpoint}:${account.id}`}>
        <div className="user-info-container">
          <Avatar accounts={this.props.activeAccounts} user={avatarUser} />
          <div className="user-info">
            {isEnterpriseAccount(account) ? (
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
            {isActive ? (
              <div className="account-status">Active account</div>
            ) : null}
          </div>
        </div>
        <div className="account-actions">
          {!isActive ? (
            <Button
              onClick={this.activate(account)}
              ariaLabel={`Switch to ${account.login}`}
            >
              Switch
            </Button>
          ) : null}
          <Button
            onClick={this.logout(account)}
            className={className}
            ariaLabel={`Sign out ${account.login}`}
          >
            {__DARWIN__ ? 'Sign Out' : 'Sign out'}
          </Button>
        </div>
      </Row>
    )
  }

  private getSignInHandler(type: SignInType) {
    return type === SignInType.DotCom
      ? this.onDotComSignIn
      : this.onEnterpriseSignIn
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

  private logout = (account: IAccountMetadata) => {
    return () => {
      this.props.onLogout(account)
    }
  }

  private activate = (account: IAccountMetadata) => {
    return () => {
      this.props.onSetActiveAccount(account)
    }
  }
}
