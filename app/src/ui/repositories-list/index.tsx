import * as React from 'react'

import { List, SelectionSource } from '../list'
import { RepositoryListItem } from './repository-list-item'
import { Repository } from '../../models/repository'
import { groupRepositories, RepositoryListItemModel, Repositoryish } from './group-repositories'
import { Dispatcher, CloningRepository } from '../../lib/dispatcher'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

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

  /** The currently entered filter text. */
  readonly filter: string
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
  private list: List | null = null
  private filterInput: HTMLInputElement | null = null

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = this.createState(props, '')
  }

  private createState(props: IRepositoriesListProps, filter: string): IRepositoriesListState {
    let repositories: ReadonlyArray<Repository | CloningRepository>
    if (filter.length) {
      repositories = props.repositories.filter(repository => repository.name.includes(filter))
    } else {
      repositories = props.repositories
    }

    const listItems = groupRepositories(repositories)
    const selectedRowIndex = getSelectedRowIndex(listItems, props.selectedRepository)

    return { listItems, selectedRowIndex, filter }
  }

  public componentWillReceiveProps(nextProps: IRepositoriesListProps) {
    this.setState(this.createState(nextProps, this.state.filter))
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

  private onRowClick = (row: number) => {
    const item = this.state.listItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const list = this.list
    if (!list) { return }

    let focusInput = false
    const firstSelectableRow = list.nextSelectableRow('down', 0)
    const lastSelectableRow = list.nextSelectableRow('up', 0)
    if (event.key === 'ArrowUp' && row === firstSelectableRow) {
      focusInput = true
    } else if (event.key === 'ArrowDown' && row === lastSelectableRow) {
      focusInput = true
    }

    if (focusInput) {
      const input = this.filterInput
      if (input) {
        event.preventDefault()
        input.focus()
      }
    }
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    this.setState({ ...this.state, selectedRowIndex: row })
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
      <div id='repository-list'>
        <Row>
          <TextBox
            type='search'
            labelClassName='filter-field'
            placeholder='Filter'
            autoFocus={true}
            onChange={this.onFilterChanged}
            onKeyDown={this.onKeyDown}
            onInputRef={this.onInputRef}/>
        </Row>

        <List
          rowCount={this.state.listItems.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderRow}
          selectedRow={this.state.selectedRowIndex}
          onSelectionChanged={this.onSelectionChanged}
          onRowClick={this.onRowClick}
          onRowKeyDown={this.onRowKeyDown}
          canSelectRow={this.canSelectRow}
          invalidationProps={this.props.repositories}
          ref={this.onListRef}/>
      </div>
    )
  }

  private onListRef = (instance: List | null) => {
    this.list = instance
  }

  private onInputRef = (instance: HTMLInputElement | null) => {
    this.filterInput = instance
  }

  private onFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value
    this.setState(this.createState(this.props, text))
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = this.list
    if (!list) { return }

    if (event.key === 'ArrowDown') {
      if (this.state.listItems.length > 0) {
        this.setState({ ...this.state, selectedRowIndex: list.nextSelectableRow('down', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (this.state.listItems.length > 0) {
        this.setState({ ...this.state, selectedRowIndex: list.nextSelectableRow('up', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'Escape') {
      if (this.state.filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
      }
    } else if (event.key === 'Enter') {
      this.onRowClick(list.nextSelectableRow('down', 0))
    }
  }
}

function Loading() {
  return <div className='sidebar-message'>Loading…</div>
}

function NoRepositories() {
  return <div className='sidebar-message'>No repositories</div>
}
