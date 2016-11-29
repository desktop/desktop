import * as React from 'react'
import { User } from '../../models/user'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'

interface IAccountsProps {
  readonly dispatcher: Dispatcher
  readonly dotComUser: User | null
  readonly enterpriseUser: User | null
}

export class Accounts extends React.Component<IAccountsProps, void> {
  public render() {
    return (
      <div>
        <h2>GitHub.com</h2>
        {this.props.dotComUser ? this.renderUser(this.props.dotComUser) : null}
        <Button disabled={!this.props.dotComUser} onClick={this.logOutDotCom}>Log Out</Button>

        <h2>Enterprise</h2>
        {this.props.enterpriseUser ? this.renderUser(this.props.enterpriseUser) : null}
        <Button disabled={!this.props.dotComUser} onClick={this.logOutEnterprise}>Log Out</Button>
      </div>
    )
  }

  private renderUser(user: User) {
    return (
      <div>
        <img className='avatar' src={user.avatarURL}/>
        <span>{user.login}</span>
      </div>
    )
  }

  private logOutDotCom = () => {
    const user = this.props.dotComUser
    if (!user) { return }

    this.props.dispatcher.removeUser(user)
  }

  private logOutEnterprise = () => {
    const user = this.props.enterpriseUser
    if (!user) { return }

    this.props.dispatcher.removeUser(user)
  }
}
