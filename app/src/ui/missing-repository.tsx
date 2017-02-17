import * as React from 'react'

import { UiView } from './ui-view'
import { Dispatcher } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { Button } from './lib/button'
import { Row } from './lib/row'

interface IMissingRepositoryProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

/** The view displayed when a repository is missing. */
export class MissingRepository extends React.Component<IMissingRepositoryProps, void> {
  public render() {
    const buttons = new Array<JSX.Element>()
    buttons.push(<Button onClick={this.locate}>Locate…</Button>)

    if (this.canCloneAgain()) {
      buttons.push(<Button onClick={this.cloneAgain}>Clone Again</Button>)
    }

    buttons.push(<Button onClick={this.remove}>Remove</Button>)

    return (
      <UiView id='missing-repository-view'>
        <div className='title-container'>
          <div className='title'>Can't find "{this.props.repository.name}"</div>
          <div className='details'>It was last seen at {this.props.repository.path}</div>
        </div>

        <Row>
          {buttons}
        </Row>
      </UiView>
    )
  }

  private canCloneAgain() {
    const gitHubRepository = this.props.repository.gitHubRepository
    return gitHubRepository && gitHubRepository.cloneURL
  }

  private remove = () => {
    this.props.dispatcher.removeRepositories([ this.props.repository ])
  }

  private locate = () => {

  }

  private cloneAgain = () => {
    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) { return }

    const cloneURL = gitHubRepository.cloneURL
    if (!cloneURL) { return }

    this.props.dispatcher.clone(cloneURL, this.props.repository.path, null)
  }
}
