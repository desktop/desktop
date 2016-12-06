import * as React from 'react'
import { SignIn } from './sign-in'
import { PublishRepository } from './publish-repository'
import { Dispatcher } from '../../lib/dispatcher'
import { User } from '../../models/user'
import { Repository } from '../../models/repository'

interface IPublishProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly users: ReadonlyArray<User>
}

export class Publish extends React.Component<IPublishProps, void> {
  public render() {
    if (this.props.users.length > 0) {
      return <PublishRepository
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        users={this.props.users}/>
    } else {
      return <SignIn dispatcher={this.props.dispatcher}/>
    }
  }
}
