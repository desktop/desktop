import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'

interface IRepositoriesListProps {
  readonly selectedRepository: Repository
  readonly onSelectionChanged: (repository: Repository) => void
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(row: number) {
    const repository = this.props.repos[row]
    return <RepositoryListItem key={row} repository={repository}/>
  }

  private get selectedRow(): number {
    let index = -1
    this.props.repos.forEach((repository, i) => {
      if (repository.id === this.props.selectedRepository.id) {
        index = i
        return
      }
    })

    return index
  }

  private onSelectionChanged(row: number) {
    const repository = this.props.repos[row]
    this.props.onSelectionChanged(repository)
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    return (
      <List id='repository-list'
            itemCount={this.props.repos.length}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(row)}
            selectedRow={this.selectedRow}
            onSelectionChanged={row => this.onSelectionChanged(row)} />
    )
  }
}

function Loading() {
  return <div>Loading…</div>
}
