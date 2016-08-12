import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'
import { groupRepositories, RepositoryListItem as RepositoryListItemModel } from './group-repositories'
import { findIndex } from '../../lib/find'
import { Dispatcher } from '../../lib/dispatcher'

interface IRepositoriesListProps {
  readonly selectedRepository: Repository | null
  readonly onSelectionChanged: (repository: Repository) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row} repository={item.repository}
                                 dispatcher={this.props.dispatcher} />
    } else {
      return <div key={row} className='repository-group-label'>{item.label}</div>
    }
  }

  private selectedRow(groupedItems: ReadonlyArray<RepositoryListItemModel>): number {
    const selectedRepository = this.props.selectedRepository
    if (!selectedRepository) { return -1 }

    return findIndex(groupedItems, item => {
      if (item.kind === 'repository') {
        const repository = item.repository
        return repository.id === selectedRepository.id
      } else {
        return false
      }
    })
  }

  private onSelectionChanged(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
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

    const grouped = groupRepositories(this.props.repos)
    return (
      <List id='repository-list'
            rowCount={grouped.length}
            rowHeight={RowHeight}
            rowRenderer={row => this.renderRow(grouped, row)}
            selectedRow={this.selectedRow(grouped)}
            onSelectionChanged={row => this.onSelectionChanged(grouped, row)}
            canSelectRow={row => this.canSelectRow(grouped, row)}/>
    )
  }
}

function Loading() {
  return <div>Loading…</div>
}
