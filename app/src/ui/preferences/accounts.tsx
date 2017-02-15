import * as React from 'react'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { assertNever } from '../../lib/fatal-error'
import { DialogContent } from '../dialog'

interface IAccountsProps {
  readonly dispatcher: Dispatcher
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null
}

enum SignInType {
  DotCom,
  Enterprise,
}

export class Accounts extends React.Component<IAccountsProps, void> {
  public render() {
    return (
      <DialogContent>
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

  private renderSignIn(type: SignInType) {
    switch (type) {
      case SignInType.DotCom: {
        return <Button>Sign in to GitHub.com</Button>
      }
      case SignInType.Enterprise:
        return <Button>Sign in to GitHub Enterprise</Button>
      default:
        return assertNever(type, `Unknown sign in type: ${type}`)
    }
  }

  private logout = (user: User) => {
    return () => {
      this.props.dispatcher.removeUser(user)
    }
  }
}
