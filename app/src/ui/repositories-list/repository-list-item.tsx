import * as React from 'react'
import Repository from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'
import { remote } from 'electron'
import { Dispatcher } from '../../lib/dispatcher'

interface IRepositoryListItemProps {
  repository: Repository
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
    const gitHubRepo = repository.gitHubRepository
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
    return nextProps.repository.id !== this.props.repository.id
  }

  private onContextMenu(event: React.MouseEvent<any>) {
    event.preventDefault()
    if (process.platform !== 'win32') {
      this.contextMenu.popup(remote.getCurrentWindow())
    }
  }

  private removeRepository() {
    const repoID: number = this.props.repository.id!
    this.props.dispatcher.removeRepositories([ repoID ])
  }
}

function iconForRepository(repository: Repository): OcticonSymbol {
  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) { return OcticonSymbol.repo }

  if (gitHubRepo.private) { return OcticonSymbol.lock }
  if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

  return OcticonSymbol.repo
}
