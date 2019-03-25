import * as React from 'react'

import { RepositoryListItem } from './repository-list-item'
import {
  groupRepositories,
  IRepositoryListItem,
  Repositoryish,
  RepositoryGroupIdentifier,
  KnownRepositoryGroup,
  reorderGroupsWithSelected,
} from './group-repositories'
import { FilterList, IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { ILocalRepositoryState } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon, OcticonSymbol } from '../octicons'
import { showContextualMenu } from '../main-process-proxy'
import { IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import { encodePathAsUrl } from '../../lib/path'
import memoizeOne from 'memoize-one'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>

  /** A cache of the latest repository state values, keyed by the repository id */
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >

  /** Called when a repository has been selected. */
  readonly onSelectionChanged: (repository: Repositoryish) => void

  /** Whether the user has enabled the setting to confirm removing a repository from the app */
  readonly askForConfirmationOnRemoveRepository: boolean

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

  readonly dispatcher: Dispatcher
}

const RowHeight = 29

/**
 * Iterate over all groups until a list item is found that matches
 * the id of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<IFilterListGroup<IRepositoryListItem>>,
  selectedRepository: Repositoryish | null
) {
  if (selectedRepository !== null) {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.repository.id === selectedRepository.id) {
          return { group, item }
        }
      }
    }
  }

  return null
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  {}
> {
  /**
   * A memoized function for grouping repositories for display
   * in the FilterList. The group will not be recomputed as long
   * as the provided list of repositories is equal to the last
   * time the method was called (reference equality).
   */
  private getRepositoryGroups = memoizeOne(
    (
      repositories: ReadonlyArray<Repositoryish> | null,
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>
    ) =>
      repositories === null
        ? []
        : groupRepositories(repositories, localRepositoryStateLookup)
  )

  /**
   * A memoized function for finding the selected list item based
   * on an IAPIRepository instance. The selected item will not be
   * recomputed as long as the provided list of repositories and
   * the selected data object is equal to the last time the method
   * was called (reference equality).
   *
   * See findMatchingListItem for more details.
   */
  private getSelectedListItem = memoizeOne(findMatchingListItem)

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        askForConfirmationOnRemoveRepository={
          this.props.askForConfirmationOnRemoveRepository
        }
        onRemoveRepository={this.props.onRemoveRepository}
        onShowRepository={this.props.onShowRepository}
        onOpenInShell={this.props.onOpenInShell}
        onOpenInExternalEditor={this.props.onOpenInExternalEditor}
        externalEditorLabel={this.props.externalEditorLabel}
        shellLabel={this.props.shellLabel}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
      />
    )
  }

  private getGroupLabel(identifier: RepositoryGroupIdentifier) {
    if (identifier === KnownRepositoryGroup.Enterprise) {
      return 'Enterprise'
    } else if (identifier === KnownRepositoryGroup.NonGitHub) {
      return 'Other'
    } else {
      return identifier
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
    const hasIndicator =
      item.changedFilesCount > 0 ||
      (item.aheadBehind !== null
        ? item.aheadBehind.ahead > 0 || item.aheadBehind.behind > 0
        : false)
    this.props.dispatcher.recordRepoClicked(hasIndicator)
    this.props.onSelectionChanged(item.repository)
  }

  public render() {
    const baseGroups = this.getRepositoryGroups(
      this.props.repositories,
      this.props.localRepositoryStateLookup
    )

    const selected = this.getSelectedListItem(
      baseGroups,
      this.props.selectedRepository
    )
    const selectedItem = selected !== null ? selected.item : selected
    const selectedGroup = selected !== null ? selected.group : selected

    const groups = reorderGroupsWithSelected(baseGroups, selectedGroup)

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
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          groups={groups}
          invalidationProps={{
            repositories: this.props.repositories,
            filterText: this.props.filterText,
          }}
        />
      </div>
    )
  }

  private renderPostFilter = () => {
    return (
      <Button
        className="new-repository-button"
        onClick={this.onNewRepositoryButtonClick}
      >
        Add
        <Octicon symbol={OcticonSymbol.triangleDown} />
      </Button>
    )
  }

  private renderNoItems = () => {
    return (
      <div className="no-items no-results-found">
        <img src={BlankSlateImage} className="blankslate-image" />
        <div className="title">Sorry, I can't find that repository</div>

        <div className="protip">
          ProTip! Press {this.renderAddLocalShortcut()} to quickly add a local
          repository, and {this.renderCloneRepositoryShortcut()} to clone from
          anywhere within the app
        </div>
      </div>
    )
  }

  private renderAddLocalShortcut() {
    if (__DARWIN__) {
      return (
        <div className="kbd-shortcut">
          <kbd>⌘</kbd>
          <kbd>O</kbd>
        </div>
      )
    } else {
      return (
        <div className="kbd-shortcut">
          <kbd>Ctrl</kbd> + <kbd>O</kbd>
        </div>
      )
    }
  }

  private renderCloneRepositoryShortcut() {
    if (__DARWIN__) {
      return (
        <div className="kbd-shortcut">
          <kbd>⇧</kbd>
          <kbd>⌘</kbd>
          <kbd>O</kbd>
        </div>
      )
    } else {
      return (
        <div className="kbd-shortcut">
          <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>O</kbd>
        </div>
      )
    }
  }

  private onNewRepositoryButtonClick = () => {
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'Clone Repository…' : 'Clone repository…',
        action: this.onCloneRepository,
      },
      {
        label: __DARWIN__ ? 'Create New Repository…' : 'Create new repository…',
        action: this.onCreateNewRepository,
      },
      {
        label: __DARWIN__
          ? 'Add Existing Repository…'
          : 'Add existing repository…',
        action: this.onAddExistingRepository,
      },
    ]

    showContextualMenu(items)
  }

  private onCloneRepository = () => {
    this.props.dispatcher.showPopup({
      type: PopupType.CloneRepository,
      initialURL: null,
    })
  }

  private onAddExistingRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.AddRepository })
  }

  private onCreateNewRepository = () => {
    this.props.dispatcher.showPopup({ type: PopupType.CreateRepository })
  }
}
