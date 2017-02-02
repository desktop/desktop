import * as React from 'react'

import { RepositoryListItem } from './repository-list-item'
import { groupRepositories, IRepositoryListItem, Repositoryish, RepositoryGroupIdentifier } from './group-repositories'
import { Dispatcher } from '../../lib/dispatcher'
import { AddRepository } from '../add-repository'
import { User } from '../../models/user'
import { FoldoutType } from '../../lib/app-state'
import { FoldoutList } from '../lib/foldout-list'

const RepositoryFoldoutList: new() => FoldoutList<IRepositoryListItem> = FoldoutList as any

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly onSelectionChanged: (repository: Repositoryish) => void
  readonly dispatcher: Dispatcher
  readonly loading: boolean
  readonly repositories: ReadonlyArray<Repositoryish>

  /** The logged in users. */
  readonly users: ReadonlyArray<User>

  /** Should the Add Repository foldout be expanded? */
  readonly expandAddRepository: boolean
}

const RowHeight = 30

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

  private renderGroupHeader = (identifier: RepositoryGroupIdentifier) => {
    const label = (() => {
      if (identifier === 'github') {
        return 'GitHub'
      } else if (identifier === 'enterprise') {
        return 'Enterprise'
      } else {
        return 'Other'
      }
    })()
    return <div key={identifier} className='repository-group-label'>{label}</div>
  }

  private onItemClick = (item: IRepositoryListItem) => {
    this.props.onSelectionChanged(item.repository)
  }

  private renderAddRepository = () => {
    if (!this.props.expandAddRepository) { return null }

    return <AddRepository dispatcher={this.props.dispatcher} users={this.props.users}/>
  }

  private onAddRepositoryBranchToggle = () => {
    this.props.dispatcher.showFoldout({
      type: FoldoutType.Repository,
      expandAddRepository: !this.props.expandAddRepository,
    })
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    if (this.props.repositories.length < 1) {
      return <NoRepositories/>
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
      <RepositoryFoldoutList
        className='repository-list'
        expandButtonTitle={__DARWIN__ ? 'Add Repository' : 'Add repository'}
        showExpansion={this.props.expandAddRepository}
        onExpandClick={this.onAddRepositoryBranchToggle}
        renderExpansion={this.renderAddRepository}
        rowHeight={RowHeight}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        renderGroupHeader={this.renderGroupHeader}
        onItemClick={this.onItemClick}
        groups={groups}
        onClose={this.onClose}
        invalidationProps={this.props.repositories}/>
    )
  }

  private onClose = () => {
    this.props.dispatcher.closeFoldout()
  }
}

function Loading() {
  return <div className='sidebar-message'>Loading…</div>
}

function NoRepositories() {
  return <div className='sidebar-message'>No repositories</div>
}
