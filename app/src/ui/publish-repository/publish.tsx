import * as React from 'react'
import { SignIn } from './sign-in'
import { PublishRepository } from './publish-repository'
import { Dispatcher, SignInState } from '../../lib/dispatcher'
import { User } from '../../models/user'
import { Repository } from '../../models/repository'

interface IPublishProps {
  readonly dispatcher: Dispatcher

  /** The repository being published. */
  readonly repository: Repository

  /** The signed in users. */
  readonly users: ReadonlyArray<User>

  /**
   * The current sign in state. This controls whether the user must first sign
   * in.
   */
  readonly signInState: SignInState | null

  /** The function to call when the dialog should be dismissed. */
  readonly onDismissed: () => void
}

/**
 * The Publish component. If no users are logged in, this will display the sign
 * in component.
 */
export class Publish extends React.Component<IPublishProps, void> {

  public render() {
    if (this.props.users.length > 0) {
      return <PublishRepository
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        users={this.props.users}
        onDismissed={this.props.onDismissed}/>
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
