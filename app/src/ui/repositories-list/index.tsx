import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'
import { groupRepositories, RepositoryListItem as RepositoryListItemModel, Repositoryish } from './group-repositories'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly onSelectionChanged: (repository: Repositoryish) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row}
                                 repository={item.repository}
                                 dispatcher={this.props.dispatcher} />
    } else {
      return <div key={row} className='repository-group-label'>{item.label}</div>
    }
  }

  private selectedRow(groupedItems: ReadonlyArray<RepositoryListItemModel>): number {
    const selectedRepository = this.props.selectedRepository
    if (!selectedRepository) { return -1 }

    return groupedItems.findIndex(item => {
      if (item.kind === 'repository') {
        const repository = item.repository
        return repository.constructor === selectedRepository.constructor && repository.id === selectedRepository.id
      } else {
        return false
      }
    })
  }

  private onRowSelected(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  private canSelectRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    return item.kind === 'repository'
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    if (this.props.repositories.length < 1) {
      return <NoRepositories/>
    }

    const grouped = groupRepositories(this.props.repositories)
    return (
      <List id='repository-list'
            rowCount={grouped.length}
            rowHeight={RowHeight}
            rowRenderer={row => this.renderRow(grouped, row)}
            selectedRow={this.selectedRow(grouped)}
            onRowSelected={row => this.onRowSelected(grouped, row)}
            canSelectRow={row => this.canSelectRow(grouped, row)}
            invalidationProps={this.props.repositories}/>
    )
  }
}

function Loading() {
  return <div className='sidebar-message'>Loading…</div>
}

function NoRepositories() {
  return <div className='sidebar-message'>No repositories</div>
}
