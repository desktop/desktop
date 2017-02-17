import * as React from 'react'

import { UiView } from './ui-view'
import { Dispatcher } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { Button } from './lib/button'

interface IMissingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

/** The view displayed when a repository is missing. */
export class MissingRepository extends React.Component<IMissingRepositoryProps, void> {
  public render() {
    return (
      <UiView id='missing-repository-view'>
        <div className='title-container'>
          <div className='title'>Can't find "{this.props.repository.name}"</div>
          <div className='details'>It was last seen at {this.props.repository.path}</div>
        </div>
      </UiView>
    )
  }

  private remove = () => {
    this.props.dispatcher.removeRepositories([ this.props.repository ])
  }
}
