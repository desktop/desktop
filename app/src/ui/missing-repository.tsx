import * as React from 'react'

import { UiView } from './ui-view'
import { Dispatcher } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { Button } from './lib/button'

interface IMissingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

export class MissingRepository extends React.Component<IMissingRepositoryProps, void> {
  public render() {
    return (
      <UiView id='missing-repository-view'>
        <h1>Can't find "{this.props.repository.name}"</h1>
        <Button onClick={this.remove}>Remove</Button>
      </UiView>
    )
  }

  private remove = () => {
    this.props.dispatcher.removeRepositories([ this.props.repository ])
  }
}
