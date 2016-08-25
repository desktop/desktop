import * as React from 'react'
import Repository from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'
import { remote } from 'electron'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'

interface IRepositoryListItemProps {
  readonly repository: Repository | CloningRepository
  readonly dispatcher: Dispatcher
}

/** A repository item. */
export default class RepositoryListItem extends React.Component<IRepositoryListItemProps, void> {
  private readonly contextMenu = new remote.Menu()

  public constructor() {
    super()
    this.contextMenu.append(new remote.MenuItem({
      label: 'Remove',
      click: () => this.removeRepository()
    }))
  }

  public render() {
    const repository = this.props.repository
    const path = repository.path
    const gitHubRepo = repository instanceof Repository ? repository.gitHubRepository : null
    const tooltip = gitHubRepo
      ? gitHubRepo.fullName + '\n' + gitHubRepo.htmlURL + '\n' + path
      : path

    return (
      <div onContextMenu={e => this.onContextMenu(e)} className='repository-list-item' title={tooltip}>
        <Octicon symbol={iconForRepository(repository)} />
        <div className='name'>{repository.name}</div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps, nextState: void): boolean {
    if (nextProps.repository instanceof Repository && this.props.repository instanceof Repository) {
      return nextProps.repository.id !== this.props.repository.id
    } else {
      return true
    }
  }

  private onContextMenu(event: React.MouseEvent<any>) {
    event.preventDefault()
    if (process.platform !== 'win32') {
      this.contextMenu.popup(remote.getCurrentWindow())
    }
  }

  private removeRepository() {
    if (this.props.repository instanceof Repository) {
      const repoID: number = this.props.repository.id
      this.props.dispatcher.removeRepositories([ repoID ])
    } else {
      // TODO: stop cloning
    }
  }
}

function iconForRepository(repository: Repository | CloningRepository): OcticonSymbol {
  const gitHubRepo = repository instanceof Repository ? repository.gitHubRepository : null
  if (!gitHubRepo) { return OcticonSymbol.repo }

  if (gitHubRepo.private) { return OcticonSymbol.lock }
  if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

  return OcticonSymbol.repo
}
