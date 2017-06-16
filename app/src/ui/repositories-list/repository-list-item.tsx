import * as React from 'react'
import { Repository } from '../../models/repository'
import { Octicon, iconForRepository } from '../octicons'
import { CloningRepository } from '../../lib/dispatcher'
import { showContextualMenu } from '../main-process-proxy'

interface IRepositoryListItemProps {
  readonly repository: Repository | CloningRepository
  readonly needsDisambiguation: boolean
  readonly onRemoveRepository: (repository: Repository | CloningRepository) => void
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

    let prefix: string | null = null
    if (this.props.needsDisambiguation && gitHubRepo) {
      prefix = `${gitHubRepo.owner.login}/`
    }

    return (
      <div onContextMenu={this.onContextMenu} className='repository-list-item' title={tooltip}>
        <Octicon symbol={iconForRepository(repository)} />

        <div className='name'>
          {prefix ? <span className='prefix'>{prefix}</span> : null}
          <span>{repository.name}</span>
        </div>
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
    this.props.onRemoveRepository(this.props.repository)
  }
}
