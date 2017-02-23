import * as React from 'react'

import { UiView } from './ui-view'
import { Dispatcher } from '../lib/dispatcher'
import { Repository } from '../models/repository'
import { Octicon, OcticonSymbol } from './octicons'
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
    buttons.push(
      <Button key='locate' onClick={this.locate}>
        <Octicon symbol={OcticonSymbol.search} />
        <span>Locate…</span>
      </Button>
    )

    if (this.canCloneAgain()) {
      buttons.push(
        <Button key='clone-again' onClick={this.cloneAgain}>
          <Octicon symbol={OcticonSymbol.repoClone} />
          <div>Clone Again</div>
        </Button>
      )
    }

    buttons.push(
      <Button key='remove' onClick={this.remove}>
        <Octicon symbol={OcticonSymbol.x} />
        <div>Remove</div>
      </Button>
    )

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
    this.props.dispatcher.relocateRepository(this.props.repository)
  }

  private cloneAgain = async () => {
    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) { return }

    const cloneURL = gitHubRepository.cloneURL
    if (!cloneURL) { return }

    // TODO: find suitable user for credentials

    await this.props.dispatcher.cloneAgain(cloneURL, this.props.repository.path, null)
  }
}
