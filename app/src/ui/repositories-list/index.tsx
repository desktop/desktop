import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'

interface IRepositoriesListProps {
  readonly selectedRow: number
  readonly onSelectionChanged: (row: number) => void
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderLoading() {
    return (
      <div>Loading…</div>
    )
  }

  private renderRow(row: number) {
    const repository = this.props.repos[row]
    return <RepositoryListItem key={row} repository={repository}/>
  }

  public render() {
    if (this.props.loading) {
      return this.renderLoading()
    }

    return (
      <List id='repository-list'
            itemCount={this.props.repos.length}
            itemHeight={RowHeight}
            renderItem={row => this.renderRow(row)}
            selectedRow={this.props.selectedRow}
            onSelectionChanged={row => this.props.onSelectionChanged(row)} />
    )
  }
}
