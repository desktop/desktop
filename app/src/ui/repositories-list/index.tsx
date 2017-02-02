import * as React from 'react'

import { RepositoryListItem } from './repository-list-item'
import { groupRepositories, RepositoryListItemModel, Repositoryish } from './group-repositories'
import { Dispatcher } from '../../lib/dispatcher'
import { AddRepository } from '../add-repository'
import { User } from '../../models/user'
import { FoldoutType } from '../../lib/app-state'
import { FoldoutList } from '../lib/foldout-list'

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

interface IRepositoryItem {
  readonly selectable: boolean
  readonly text?: string
  readonly id?: string
  readonly model: RepositoryListItemModel
}

const MyFoldoutList: new() => FoldoutList<IRepositoryItem> = FoldoutList as any

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderItem = (item: IRepositoryItem) => {
    const model = item.model
    if (model.kind === 'repository') {
      return <RepositoryListItem
        key={item.id}
        repository={model.repository}
        dispatcher={this.props.dispatcher}
      />
    } else {
      return <div key={item.id} className='repository-group-label'>{model.label}</div>
    }
  }

  private onItemClick = (item: IRepositoryItem) => {
    if (item.model.kind === 'repository') {
      this.props.onSelectionChanged(item.model.repository)
    }
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

    const grouped = groupRepositories(this.props.repositories)
    const items: ReadonlyArray<IRepositoryItem> = grouped.map(item => {
      if (item.kind === 'repository') {
        const repository = item.repository
        return {
          model: item,
          text: repository.name,
          id: repository.id.toString(),
          selectable: true,
        }
      } else {
        return {
          model: item,
          selectable: false,
        }
      }
    })

    let selectedItem: IRepositoryItem | null = null
    const selectedRepository = this.props.selectedRepository
    if (selectedRepository) {
      selectedItem = items.find(i => {
        const model = i.model
        if (model.kind === 'repository') {
          return model.repository.id === selectedRepository.id
        } else {
          return false
        }
      }) || null
    }

    return (
      <MyFoldoutList
        className='repository-list'
        expandButtonTitle={__DARWIN__ ? 'Add Repository' : 'Add repository'}
        showExpansion={this.props.expandAddRepository}
        onExpandClick={this.onAddRepositoryBranchToggle}
        renderExpansion={this.renderAddRepository}
        rowHeight={RowHeight}
        selectedItem={selectedItem}
        renderItem={this.renderItem}
        onItemClick={this.onItemClick}
        items={items}
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
