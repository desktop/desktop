import * as React from 'react'
import { User } from '../../models/user'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { assertNever } from '../../lib/fatal-error'
import { DialogContent } from '../dialog'

interface IAccountsProps {
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null

  readonly onDotComSignIn: () => void
  readonly onEnterpriseSignIn: () => void
  readonly onLogout: (user: User) => void
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
        {this.props.dotComUser ? this.renderUser(this.props.dotComUser) : this.renderSignIn(SignInType.DotCom)}

        <h2>Enterprise</h2>
        {this.props.enterpriseUser ? this.renderUser(this.props.enterpriseUser) : this.renderSignIn(SignInType.Enterprise)}
      </DialogContent>
    )
  }

  private renderUser(user: User) {
    return (
      <div>
        <img className='avatar' src={user.avatarURL}/>
        <span>{user.login}</span>
        <Button onClick={this.logout(user)}>Log Out</Button>
      </div>
    )
  }

  private onDotComSignIn = (event: React.FormEvent<HTMLButtonElement>) => {
    event.preventDefault()
    this.props.onDotComSignIn()
  }

  private onEnterpriseSignIn = (event: React.FormEvent<HTMLButtonElement>) => {
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

  private logout = (user: User) => {
    return () => {
      this.props.onLogout(user)
    }
  }
}
