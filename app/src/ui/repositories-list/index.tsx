import * as React from 'react'

import List from '../list'
import RepositoryListItem from './repository-list-item'
import Repository from '../../models/repository'
import { getDotComAPIEndpoint } from '../../lib/api'

interface IRepositoriesListProps {
  readonly selectedRepository: Repository
  readonly onSelectionChanged: (repository: Repository) => void
  readonly loading: boolean
  readonly repos: ReadonlyArray<Repository>
}

const RowHeight = 42

/** The list of user-added repositories. */
export default class RepositoriesList extends React.Component<IRepositoriesListProps, void> {
  private renderRow(groupedItems: ReadonlyArray<ListItem>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      return <RepositoryListItem key={row} repository={item.repository}/>
    } else {
      return <div key={row}>{item.label}</div>
    }
  }

  private selectedRow(groupedItems: ReadonlyArray<ListItem>): number {
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

  private onSelectionChanged(groupedItems: ReadonlyArray<ListItem>, row: number) {
    const item = groupedItems[row]
    if (item.kind === 'repository') {
      this.props.onSelectionChanged(item.repository)
    }
  }

  public render() {
    if (this.props.loading) {
      return <Loading/>
    }

    const grouped = groupedRepositoryItems(this.props.repos)
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

type Group = 'github' | 'enterprise' | 'other'

type ListItem = { kind: 'repository', repository: Repository } | { kind: 'label', label: string }

function groupedRepositoryItems(repositories: ReadonlyArray<Repository>): ReadonlyArray<ListItem> {
  const grouped = new Map<Group, Repository[]>()
  repositories.forEach(repository => {
    const gitHubRepository = repository.gitHubRepository
    let group: Group = 'other'
    if (gitHubRepository) {
      if (gitHubRepository.endpoint === getDotComAPIEndpoint()) {
        group = 'github'
      } else {
        group = 'enterprise'
      }
    } else {
      group = 'other'
    }

    let repositories = grouped.get(group)
    if (!repositories) {
      repositories = new Array<Repository>()
      grouped.set(group, repositories)
    }

    repositories.push(repository)
  })

  const flattened = new Array<ListItem>()
  grouped.forEach((repositories, group) => {
    let label = 'Other'
    if (group === 'github') {
      label = 'GitHub'
    } else if (group === 'enterprise') {
      label = 'Enterprise'
    }
    flattened.push({ kind: 'label', label })

    for (const repository of repositories) {
      flattened.push({ kind: 'repository', repository })
    }
  })

  return flattened
}
