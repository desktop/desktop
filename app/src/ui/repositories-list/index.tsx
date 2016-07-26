import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'
import { groupRepositories, RepositoryListItem as RepositoryListItemModel } from './group-repositories'

interface IRepositoriesListProps {
  readonly selectedRepository: Repository
  readonly onSelectionChanged: (repository: Repository) => void
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row} repository={item.repository}/>
    } else {
      return <div key={row} className='repository-group-label'>{item.label}</div>
    }
  }

  private selectedRow(groupedItems: ReadonlyArray<RepositoryListItemModel>): number {
    let index = -1
    groupedItems.forEach((item, i) => {
      if (item.kind === 'repository') {
        const repository = item.repository
        if (repository.id === this.props.selectedRepository.id) {
          index = i
          return
        }
      }
    })

    return index
  }

  private onSelectionChanged(groupedItems: ReadonlyArray<RepositoryListItemModel>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    const grouped = groupRepositories(this.props.repos)
    return (
      <List id='repository-list'
            itemCount={grouped.length}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(grouped, row)}
            selectedRow={this.selectedRow(grouped)}
            onSelectionChanged={row => this.onSelectionChanged(grouped, row)} />
    )
  }
}

function Loading() {
  return <div>Loading…</div>
}
