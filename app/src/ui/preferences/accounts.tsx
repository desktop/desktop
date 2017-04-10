import * as React from 'react'
import { Account } from '../../models/account'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { assertNever } from '../../lib/fatal-error'
import { DialogContent } from '../dialog'
import { Avatar, IAvatarUser } from '../lib/avatar'

interface IAccountsProps {
  readonly dotComAccount: Account | null
  readonly enterpriseAccount: Account | null

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (account: Account) => void
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, void> {
  public render() {
    return (
      <DialogContent className='accounts-tab'>
        <h2>GitHub.com</h2>
        {this.props.dotComAccount ? this.renderAccount(this.props.dotComAccount) : this.renderSignIn(SignInType.DotCom)}

        <h2>Enterprise</h2>
        {this.props.enterpriseAccount ? this.renderAccount(this.props.enterpriseAccount) : this.renderSignIn(SignInType.Enterprise)}
      </DialogContent>
    )
  }

  private renderAccount(account: Account) {
    const email = account.emails.length ? account.emails[0].email : ''

    const avatarUser: IAvatarUser = {
      name: account.name,
      email: email,
      avatarURL: account.avatarURL,
    }

    return (
      <Row className='account-info'>
        <Avatar user={avatarUser} />
        <div className='user-info'>
          <div className='name'>{account.name}</div>
          <div className='login'>@{account.login}</div>
        </div>
        <Button onClick={this.logout(account)}>Log Out</Button>
      </Row>
    )
  }

  private onDotComSignIn = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onEnterpriseSignIn()
  }

  private renderSignIn(type: SignInType) {
    switch (type) {
      case SignInType.DotCom: {

        return (
          <Row className='account-sign-in'>
            <div>
              Sign in to your GitHub.com account to access your
              repositories
            </div>
            <Button type='submit' onClick={this.onDotComSignIn}>Sign in</Button>
          </Row>
        )
      }
      case SignInType.Enterprise:
        return (
          <Row className='account-sign-in'>
            <div>
              If you have a GitHub Enterprise account at work, sign in to it
              to get access to your repositories.
            </div>
            <Button type='submit' onClick={this.onEnterpriseSignIn}>Sign in</Button>
          </Row>
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
