import * as React from 'react'

import { RepositoryListItem } from './repository-list-item'
import { groupRepositories, IRepositoryListItem, Repositoryish, RepositoryGroupIdentifier } from './group-repositories'
import { Dispatcher } from '../../lib/dispatcher'
import { FilterList } from '../lib/filter-list'
import { assertNever } from '../../lib/fatal-error'

/**
 * TS can't parse generic specialization in JSX, so we have to alias it here
 * with the generic type. See https://github.com/Microsoft/TypeScript/issues/6395.
 */
const RepositoryFilterList: new() => FilterList<IRepositoryListItem> = FilterList as any

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly onSelectionChanged: (repository: Repositoryish) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repositories: ReadonlyArray<Repositoryish>
}

const RowHeight = 25

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderItem = (item: IRepositoryListItem) => {
    const repository = item.repository
    return <RepositoryListItem
      key={repository.id}
      repository={repository}
      dispatcher={this.props.dispatcher}
    />
  }

  private getGroupLabel(identifier: RepositoryGroupIdentifier) {
    if (identifier === 'github') {
      return 'GitHub'
    } else if (identifier === 'enterprise') {
      return 'Enterprise'
    } else if (identifier === 'other') {
      return 'Other'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private renderGroupHeader = (identifier: RepositoryGroupIdentifier) => {
    const label = this.getGroupLabel(identifier)
    return <div key={identifier} className='repository-group-label'>{label}</div>
  }

  private onItemClick = (item: IRepositoryListItem) => {
    this.props.onSelectionChanged(item.repository)
  }

  private onFilterKeyDown = (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.dispatcher.closeFoldout()
        event.preventDefault()
      }
    }
  }

  public render() {
    if (this.props.loading) {
      return this.loading()
    }

    if (this.props.repositories.length < 1) {
      return this.noRepositories()
    }

    const groups = groupRepositories(this.props.repositories)

    let selectedItem: IRepositoryListItem | null = null
    const selectedRepository = this.props.selectedRepository
    if (selectedRepository) {
      for (const group of groups) {
        selectedItem = group.items.find(i => {
          const repository = i.repository
          return repository.id === selectedRepository.id
        }) || null

        if (selectedItem) { break }
      }
    }

    return (
      <div className='repository-list'>
        <RepositoryFilterList
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          onFilterKeyDown={this.onFilterKeyDown}
          groups={groups}
          invalidationProps={this.props.repositories}/>
      </div>
    )
  }

  private noRepositories() {
    return (
      <div className='repository-list'>
        <div className='filter-list'>
          <div className='sidebar-message'>No repositories</div>
        </div>
      </div>)
  }

  private loading() {
    return (
      <div className='repository-list'>
        <div className='filter-list'>
          <div className='sidebar-message'>Loading…</div>
        </div>
      </div>)
  }
}
