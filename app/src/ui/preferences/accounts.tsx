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
        <div>{this.props.dotComUser ? this.props.dotComUser.login : null}</div>
        <Button onClick={this.logOutDotCom}>Log Out</Button>

        <h2>Enterprise</h2>
        <div>{this.props.enterpriseUser ? this.props.enterpriseUser.login : null}</div>
        <Button onClick={this.logOutEnterprise}>Log Out</Button>
      </div>
    )
  }

  private logOutDotCom = () => {

  }

  private logOutEnterprise = () => {

  }
}
