import * as React from 'react'
import { User } from '../../models/user'
import { Button } from '../lib/button'
import { Row } from '../lib/row'
import { assertNever } from '../../lib/fatal-error'
import { DialogContent } from '../dialog'
import { Avatar, IAvatarUser } from '../lib/avatar'
import { CallToAction } from '../lib/call-to-action'

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
    const email = user.emails[0] || ''

    const avatarUser: IAvatarUser = {
      name: user.name,
      email: email,
      avatarURL: user.avatarURL,
    }

    return (
      <Row className='account-info'>
        <Avatar user={avatarUser} />
        <div className='user-info'>
          <div className='name'>{user.name}</div>
          <div className='login'>@{user.login}</div>
        </div>
        <Button onClick={this.logout(user)}>Log Out</Button>
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
    switch (type) {
      case SignInType.DotCom: {

        return (
          <CallToAction actionTitle='Sign In' onAction={this.onDotComSignIn}>
            Sign in to your GitHub.com account to access your repositories
          </CallToAction>
        )
      }
      case SignInType.Enterprise:
        return (
          <CallToAction actionTitle='Sign In' onAction={this.onEnterpriseSignIn}>
            If you have a GitHub Enterprise account at work, sign in to it to get access to your repositories.
          </CallToAction>
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
