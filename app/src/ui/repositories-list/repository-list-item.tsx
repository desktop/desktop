import * as React from 'react'
import Repository from '../../models/repository'
import { Octicon, OcticonSymbol } from '../octicons'
import { ipcMain, remote } from 'electron'

interface IRepositoryListItemProps {
  repository: Repository
}

/** A repository item. */
export default class RepositoryListItem extends React.Component<IRepositoryListItemProps, void> {
  private readonly contextMenu = new remote.Menu()

  public constructor() {
    super()
    this.contextMenu.append(new remote.MenuItem({
      label: 'Remove',
      async click (item: any, focusedWindow: Electron.BrowserWindow) {
        ipcMain.emit('menu-event', { name: 'remove-repository' })
      }
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

  onContextMenu(event: React.MouseEvent<any>) {
    console.log('right clicked repo')
    event.preventDefault()
    this.contextMenu.popup(remote.getCurrentWindow())
  }

  public shouldComponentUpdate(nextProps: IRepositoryListItemProps, nextState: void): boolean {
    return nextProps.repository.id !== this.props.repository.id
  }
}

function iconForRepository(repository: Repository): OcticonSymbol {
  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) { return OcticonSymbol.repo }

  if (gitHubRepo.private) { return OcticonSymbol.lock }
  if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

  return OcticonSymbol.repo
}
