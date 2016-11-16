import * as React from 'react'

import { List } from '../list'
import { RepositoryListItem } from './repository-list-item'
import { Repository } from '../../models/repository'
import { groupRepositories, RepositoryListItemModel, Repositoryish } from './group-repositories'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly onSelectionChanged: (repository: Repositoryish) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repositories: ReadonlyArray<Repository | CloningRepository>
}

interface IRepositoriesListState {
  readonly listItems: ReadonlyArray<RepositoryListItemModel>
  readonly selectedRowIndex: number
}

const RowHeight = 30

/**
 * Utility function for finding the index of a selected repository
 * among a list of repository list item models.
 */
function getSelectedRowIndex(repositories: ReadonlyArray<RepositoryListItemModel>, selectedRepository: Repositoryish | null): number {
  if (!selectedRepository) { return -1 }

  return repositories.findIndex(item => {
    if (item.kind === 'repository') {
      const repository = item.repository
      return repository.constructor === selectedRepository.constructor && repository.id === selectedRepository.id
    } else {
      return false
    }
  })
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<IRepositoriesListProps, IRepositoriesListState> {

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = this.createState(props)
  }

  private createState(props: IRepositoriesListProps): IRepositoriesListState {

    const listItems = groupRepositories(props.repositories)
    const selectedRowIndex = getSelectedRowIndex(listItems, props.selectedRepository)

    return { listItems, selectedRowIndex }
  }

  public componentWillReceiveProps(nextProps: IRepositoriesListProps) {
    this.setState(this.createState(nextProps))
  }

  private renderRow = (row: number) => {
    const item = this.state.listItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row}
                                 repository={item.repository}
                                 dispatcher={this.props.dispatcher} />
    } else {
      return <div key={row} className='repository-group-label'>{item.label}</div>
    }
  }

  private onSelectionChanged = (row: number) => {
    const item = this.state.listItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  private canSelectRow = (row: number) => {
    const item = this.state.listItems[row]
    return item.kind === 'repository'
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    if (this.props.repositories.length < 1) {
      return <NoRepositories/>
    }

    return (
      <List id='repository-list'
            rowCount={this.state.listItems.length}
            rowHeight={RowHeight}
            rowRenderer={this.renderRow}
            selectedRow={this.state.selectedRowIndex}
            onSelectionChanged={this.onSelectionChanged}
            canSelectRow={this.canSelectRow}
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
