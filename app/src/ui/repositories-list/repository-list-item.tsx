import * as React from 'react'
import { Repository } from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'
import { showContextualMenu } from '../main-process-proxy'

interface IRepositoryListItemProps {
  readonly repository: Repository | CloningRepository
  readonly dispatcher: Dispatcher
}

/** A repository item. */
export class RepositoryListItem extends React.Component<IRepositoryListItemProps, void> {
  public render() {
    const repository = this.props.repository
    const path = repository.path
    const gitHubRepo = repository instanceof Repository ? repository.gitHubRepository : null
    const tooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + path
      : path

    return (
      <div onContextMenu={this.onContextMenu} className='repository-list-item' title={tooltip}>
        <Octicon symbol={iconForRepository(repository)} />
        <div className='name'>{repository.name}</div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps): boolean {
    if (nextProps.repository instanceof Repository && this.props.repository instanceof Repository) {
      return nextProps.repository.id !== this.props.repository.id
    } else {
      return true
    }
  }

  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    const item = {
      label: 'Remove',
      action: () => this.removeRepository(),
    }
    showContextualMenu([ item ])
  }

  private removeRepository() {
    this.props.dispatcher.removeRepositories([ this.props.repository ])
  }
}

function iconForRepository(repository: Repository | CloningRepository): OcticonSymbol {

  if (repository instanceof CloningRepository) {
    return OcticonSymbol.desktopDownload
  } else {
    const gitHubRepo = repository.gitHubRepository
    if (!gitHubRepo) { return OcticonSymbol.deviceDesktop }

    if (gitHubRepo.private) { return OcticonSymbol.lock }
    if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

    return OcticonSymbol.repo
  }
}
