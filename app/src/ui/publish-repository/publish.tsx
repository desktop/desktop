import * as React from 'react'
import { SignIn } from './sign-in'
import { PublishRepository } from './publish-repository'
import { Dispatcher, SignInState } from '../../lib/dispatcher'
import { Account } from '../../models/account'
import { Repository } from '../../models/repository'

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in accounts. */
  readonly accounts: ReadonlyArray<Account>

  readonly signInState: SignInState | null
}

/**
 * The Publish component. If no users are logged in, this will display the sign
 * in component.
 */
export class Publish extends React.Component<IPublishProps, void> {

  public render() {
    if (this.props.accounts.length > 0) {
      return <PublishRepository
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        users={this.props.accounts}/>
    } else {
      return (
        <SignIn
          dispatcher={this.props.dispatcher}
          signInState={this.props.signInState}
        />
      )
    }
  }
}
