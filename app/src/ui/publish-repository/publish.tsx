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

  readonly signInState: SignInState | null
}

/**
 * The Publish component. If no users are logged in, this will display the sign
 * in component.
 */
export class Publish extends React.Component<IPublishProps, void> {

  public constructor(props: IPublishProps) {
    super(props)
    this.receiveProps(props)
  }

  private receiveProps(props: IPublishProps) {
    if (!props.users.length && !props.signInState) {
      props.dispatcher.beginDotComSignIn()
    }
  }

  public componentWillReceiveProps(nextProps: IPublishProps) {
    this.receiveProps(nextProps)
  }

  public render() {
    if (this.props.users.length > 0) {
      return <PublishRepository
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        users={this.props.users}/>
    } else {

      const signInState = this.props.signInState

      if (!signInState) {
        return null
      }

      return (
        <SignIn
          dispatcher={this.props.dispatcher}
          signInState={signInState}
        />
      )
    }
  }
}
