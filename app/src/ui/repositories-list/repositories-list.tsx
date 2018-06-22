import * as React from 'react'

import { RepositoryListItem } from './repository-list-item'
import {
  groupRepositories,
  IRepositoryListItem,
  Repositoryish,
  RepositoryGroupIdentifier,
} from './group-repositories'
import { FilterList } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { assertNever } from '../../lib/fatal-error'
import { ILocalRepositoryState } from '../../models/repository'

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>

  /** A cache of the latest repository state values, keyed by the repository id */
  readonly localRepositoryStateLookup: Map<number, ILocalRepositoryState>

  /** Called when a repository has been selected. */
  readonly onSelectionChanged: (repository: Repositoryish) => void

  /** Called when the repository should be removed. */
  readonly onRemoveRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in Finder/Explorer/File Manager. */
  readonly onShowRepository: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** The label for the user's preferred shell. */
  readonly shellLabel: string

  /** The callback to fire when the filter text has changed */
  readonly onFilterTextChanged: (text: string) => void

  /** The text entered by the user to filter their repository list */
  readonly filterText: string
}

const RowHeight = 29

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  {}
> {
  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        onRemoveRepository={this.props.onRemoveRepository}
        onShowRepository={this.props.onShowRepository}
        onOpenInShell={this.props.onOpenInShell}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        externalEditorLabel={this.props.externalEditorLabel}
        shellLabel={this.props.shellLabel}
        matches={matches}
      />
    )
  }

  private getGroupLabel(identifier: RepositoryGroupIdentifier) {
    if (identifier === 'github') {
      return 'GitHub.com'
    } else if (identifier === 'enterprise') {
      return 'Enterprise'
    } else if (identifier === 'other') {
      return 'Other'
    } else {
      return assertNever(identifier, `Unknown identifier: ${identifier}`)
    }
  }

  private renderGroupHeader = (id: string) => {
    const identifier = id as RepositoryGroupIdentifier
    const label = this.getGroupLabel(identifier)
    return (
      <div key={identifier} className="filter-list-group-header">
        {label}
      </div>
    )
  }

  private onItemClick = (item: IRepositoryListItem) => {
    this.props.onSelectionChanged(item.repository)
  }

  public render() {
    if (this.props.repositories.length < 1) {
      return this.noRepositories()
    }

    const groups = groupRepositories(
      this.props.repositories,
      this.props.localRepositoryStateLookup
    )

    let selectedItem: IRepositoryListItem | null = null
    const selectedRepository = this.props.selectedRepository
    if (selectedRepository) {
      for (const group of groups) {
        selectedItem =
          group.items.find(i => {
            const repository = i.repository
            return repository.id === selectedRepository.id
          }) || null

        if (selectedItem) {
          break
        }
      }
    }

    return (
      <div className="repository-list">
        <FilterList<IRepositoryListItem>
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          renderItem={this.renderItem}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          groups={groups}
          invalidationProps={{
            repositories: this.props.repositories,
            filterText: this.props.filterText,
          }}
        />
      </div>
    )
  }

  private noRepositories() {
    return (
      <div className="repository-list">
        <div className="filter-list">
          <div className="sidebar-message">No repositories</div>
        </div>
      </div>
    )
  }
}
