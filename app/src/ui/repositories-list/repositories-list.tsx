import * as React from 'react'

import { commitGrammar, RepositoryListItem } from './repository-list-item'
import {
  groupRepositories,
  IRepositoryListItem,
  Repositoryish,
  RepositoryListGroup,
  getGroupKey,
} from './group-repositories'
import { IFilterListGroup } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { ILocalRepositoryState, Repository } from '../../models/repository'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu } from '../../lib/menu-item'
import { IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import { encodePathAsUrl } from '../../lib/path'
import { TooltippedContent } from '../lib/tooltipped-content'
import memoizeOne from 'memoize-one'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { generateRepositoryListContextMenu } from '../repositories-list/repository-list-item-context-menu'
import { enableWorktreeSupport } from '../../lib/feature-flag'
import { SectionFilterList } from '../lib/section-filter-list'
import { assertNever } from '../../lib/fatal-error'
import { IAheadBehind } from '../../models/branch'
import {
  SubmoduleEntry,
  SubmoduleWorkingTreeState,
} from '../../models/submodule'
import { HighlightText } from '../lib/highlight-text'
import {
  assignRepositoryFolder,
  createRepositoryFolder,
  deleteRepositoryFolder,
  getRepositoryFolder,
  IRepositoryFoldersState,
  loadRepositoryFolders,
  renameRepositoryFolder,
  saveRepositoryFolders,
  toggleRepositoryFolder,
} from '../../lib/repository-folders'
import classNames from 'classnames'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly recentRepositories: ReadonlyArray<number>
  readonly submodules: ReadonlyArray<SubmoduleEntry>

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

  /** Called when the repository should be opened on GitHub in the default web browser. */
  readonly onViewOnGitHub: (repository: Repositoryish) => void

  /** Called when the repository should be shown in the shell. */
  readonly onOpenInShell: (repository: Repositoryish) => void

  /** Called when the repository should be opened in an external editor */
  readonly onOpenInExternalEditor: (repository: Repositoryish) => void

  /** The current external editor selected by the user */
  readonly externalEditorLabel?: string

  /** The label for the user's preferred shell. */
  readonly shellLabel?: string

  /** The callback to fire when the filter text has changed */
  readonly onFilterTextChanged: (text: string) => void

  /** The text entered by the user to filter their repository list */
  readonly filterText: string

  readonly dispatcher: Dispatcher
}

interface IRepositoriesListState {
  readonly newRepositoryMenuExpanded: boolean
  readonly selectedItem: IRepositoryListItem | null
  readonly repositoryFolders: IRepositoryFoldersState
}

const RowHeight = 29

/**
 * Iterate over all groups until a list item is found that matches
 * the id of the provided repository.
 */
function findMatchingListItem(
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >,
  selectedRepository: Repositoryish | null
) {
  if (selectedRepository !== null) {
    for (const group of groups) {
      for (const item of group.items) {
        if (
          item.submodulePath === null &&
          item.repository.id === selectedRepository.id
        ) {
          return item
        }
      }
    }
  }

  return null
}

function findListItemByID(
  groups: ReadonlyArray<
    IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
  >,
  id: string
) {
  for (const group of groups) {
    const item = group.items.find(item => item.id === id)
    if (item !== undefined) {
      return item
    }
  }

  return null
}

/** The list of user-added repositories. */
export class RepositoriesList extends React.Component<
  IRepositoriesListProps,
  IRepositoriesListState
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
      localRepositoryStateLookup: ReadonlyMap<number, ILocalRepositoryState>,
      recentRepositories: ReadonlyArray<number>,
      selectedRepository: Repository | null,
      submodules: ReadonlyArray<SubmoduleEntry>,
      repositoryFolders: IRepositoryFoldersState
    ) =>
      repositories === null
        ? []
        : groupRepositories(
            repositories,
            localRepositoryStateLookup,
            recentRepositories,
            selectedRepository,
            submodules,
            repositoryFolders
          )
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

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = {
      newRepositoryMenuExpanded: false,
      selectedItem: null,
      repositoryFolders: loadRepositoryFolders(),
    }
  }

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    if (item.submodulePath !== null && item.submoduleDisplayName !== null) {
      return (
        <div
          className={classNames(
            'repository-list-item',
            'submodule',
            'direct-submodule',
            {
              'repository-folder-submodule': item.isInRepositoryFolder,
            }
          )}
        >
          <Octicon
            className="icon-for-repository"
            symbol={octicons.fileSubmodule}
          />
          <div className="name">
            <HighlightText
              text={item.submoduleDisplayName}
              highlight={matches.title}
            />
          </div>
          <Octicon
            className="direct-submodule-open"
            symbol={octicons.chevronRight}
          />
        </div>
      )
    }

    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
        isSubmodule={item.isSubmodule}
        isInRepositoryFolder={item.isInRepositoryFolder}
      />
    )
  }

  private getAheadBehindTooltip = (aheadBehind: IAheadBehind | null) => {
    if (aheadBehind === null) {
      return null
    }

    const { ahead, behind } = aheadBehind

    if (behind === 0 && ahead === 0) {
      return null
    }

    return (
      'The currently checked out branch is' +
      (behind ? ` ${commitGrammar(behind)} behind ` : '') +
      (behind && ahead ? 'and' : '') +
      (ahead ? ` ${commitGrammar(ahead)} ahead of ` : '') +
      'its tracked branch.'
    )
  }

  private renderRowFocusTooltip = (
    item: IRepositoryListItem
  ): JSX.Element | string | null => {
    const { repository, aheadBehind, changedFilesCount, isSubmodule } = item
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const alias =
      item.submodulePath === null && repository instanceof Repository
        ? repository.alias
        : null
    const realName =
      item.submoduleDisplayName ??
      (gitHubRepo ? gitHubRepo.fullName : repository.name)
    const path = item.submodulePath ?? repository.path
    const aheadBehindTooltip = this.getAheadBehindTooltip(aheadBehind)
    const hasChanges = changedFilesCount > 0
    const uncommittedChangesTooltip = hasChanges
      ? `There are uncommitted changes in this repository.`
      : null

    const ahead = aheadBehind?.ahead ?? 0
    const behind = aheadBehind?.behind ?? 0

    return (
      <div className="repository-list-item-tooltip list-item-tooltip">
        <div>
          <div className="label">Full Name: </div>
          {realName}
          {alias && <> ({alias})</>}
        </div>
        <div>
          <div className="label">Path: </div>
          {path}
        </div>
        {isSubmodule && (
          <div>
            <div className="label">Type: </div>
            Submodule
          </div>
        )}
        {aheadBehindTooltip && (
          <div>
            <div className="label">
              <div className="ahead-behind">
                {ahead > 0 && <Octicon symbol={octicons.arrowUp} />}
                {behind > 0 && <Octicon symbol={octicons.arrowDown} />}
              </div>
            </div>
            {aheadBehindTooltip}
          </div>
        )}
        {uncommittedChangesTooltip && (
          <div>
            <div className="label">
              <span className="change-indicator-wrapper">
                <Octicon symbol={octicons.dotFill} />
              </span>
            </div>
            {uncommittedChangesTooltip}
          </div>
        )}
      </div>
    )
  }

  private getGroupLabel(group: RepositoryListGroup) {
    const { kind } = group
    if (kind === 'enterprise') {
      return group.host
    } else if (kind === 'other') {
      return 'Other'
    } else if (kind === 'dotcom') {
      return group.owner.login
    } else if (kind === 'recent') {
      return 'Recent'
    } else if (kind === 'submodules') {
      return 'Submodules'
    } else if (kind === 'folder') {
      return group.name
    } else {
      assertNever(kind, `Unknown repository group kind ${kind}`)
    }
  }

  private renderGroupHeader = (group: RepositoryListGroup) => {
    const label = this.getGroupLabel(group)

    if (group.kind === 'folder') {
      const isCollapsed =
        this.state.repositoryFolders.collapsedFolders.includes(group.name)

      return (
        <button
          type="button"
          value={group.name}
          className="repository-folder-header"
          aria-label={`${isCollapsed ? 'Expand' : 'Collapse'} ${label}`}
          aria-expanded={!isCollapsed}
          onClick={this.onRepositoryFolderHeaderClick}
          onContextMenu={this.onRepositoryFolderHeaderContextMenu}
        >
          <Octicon
            className="repository-folder-chevron"
            symbol={isCollapsed ? octicons.chevronRight : octicons.chevronDown}
          />
          <Octicon symbol={octicons.fileDirectory} />
          <span>{label}</span>
        </button>
      )
    }

    return (
      <TooltippedContent
        key={getGroupKey(group)}
        className="filter-list-group-header"
        tooltip={label}
        onlyWhenOverflowed={true}
        tagName="div"
      >
        {label}
      </TooltippedContent>
    )
  }

  private onItemClick = async (item: IRepositoryListItem) => {
    if (item.submodulePath !== null) {
      if (
        item.repository instanceof Repository &&
        item.submoduleDisplayName !== null &&
        item.submoduleWorkingTreeState ===
          SubmoduleWorkingTreeState.Uninitialized
      ) {
        const initialized = await this.props.dispatcher.initializeSubmodule(
          item.repository,
          item.submoduleDisplayName
        )

        if (!initialized) {
          return
        }
      }

      this.props.dispatcher.openOrAddRepository(item.submodulePath)
      return
    }

    const hasIndicator =
      item.changedFilesCount > 0 ||
      (item.aheadBehind !== null
        ? item.aheadBehind.ahead > 0 || item.aheadBehind.behind > 0
        : false)
    this.props.dispatcher.recordRepoClicked(hasIndicator)
    this.props.onSelectionChanged(item.repository)
  }

  private onItemContextMenu = (
    item: IRepositoryListItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    event.preventDefault()

    if (item.submodulePath !== null) {
      return
    }

    const items = generateRepositoryListContextMenu({
      onRemoveRepository: this.props.onRemoveRepository,
      onShowRepository: this.props.onShowRepository,
      onOpenInShell: this.props.onOpenInShell,
      onOpenInExternalEditor: this.props.onOpenInExternalEditor,
      askForConfirmationOnRemoveRepository:
        this.props.askForConfirmationOnRemoveRepository,
      externalEditorLabel: this.props.externalEditorLabel,
      onChangeRepositoryAlias: this.onChangeRepositoryAlias,
      onRemoveRepositoryAlias: this.onRemoveRepositoryAlias,
      repositoryFolders: item.isSubmodule
        ? undefined
        : this.state.repositoryFolders.folders,
      currentRepositoryFolder:
        item.isSubmodule || !(item.repository instanceof Repository)
          ? null
          : getRepositoryFolder(this.state.repositoryFolders, item.repository),
      onMoveToRepositoryFolder: item.isSubmodule
        ? undefined
        : this.onMoveToRepositoryFolder,
      onCreateRepositoryFolder: item.isSubmodule
        ? undefined
        : this.onCreateRepositoryFolder,
      onViewOnGitHub: this.props.onViewOnGitHub,
      onCreateWorktree: enableWorktreeSupport()
        ? this.onCreateWorktree
        : undefined,
      onShowWorktrees: enableWorktreeSupport()
        ? this.onShowWorktrees
        : undefined,
      repository: item.repository,
      shellLabel: this.props.shellLabel,
    })

    showContextualMenu(items)
  }

  private getItemAriaLabel = (item: IRepositoryListItem) =>
    item.submoduleDisplayName ??
    (item.isSubmodule
      ? `${item.repository.name}, submodule`
      : item.repository.name)
  private getGroupAriaLabelGetter =
    (
      groups: ReadonlyArray<
        IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
      >
    ) =>
    (group: number) =>
      this.getGroupLabel(groups[group].identifier)

  public render() {
    const groups = this.getRepositoryGroups(
      this.props.repositories,
      this.props.localRepositoryStateLookup,
      this.props.recentRepositories,
      this.props.selectedRepository instanceof Repository
        ? this.props.selectedRepository
        : null,
      this.props.submodules,
      this.state.repositoryFolders
    )

    // So there's two types of selection at play here. There's the repository
    // selection for the whole app and then there's the keyboard selection in
    // the list itself. If the user has selected a repository using keyboard
    // navigation we want to honor that selection. If the user hasn't selected a
    // repository yet we'll select the repository currently selected in the app.
    const selectedItemFromState =
      this.state.selectedItem === null
        ? null
        : findListItemByID(groups, this.state.selectedItem.id)
    const selectedItem =
      selectedItemFromState ??
      this.getSelectedListItem(groups, this.props.selectedRepository)

    return (
      <div className="repository-list">
        <SectionFilterList<IRepositoryListItem, RepositoryListGroup>
          rowHeight={RowHeight}
          selectedItem={selectedItem}
          filterText={this.props.filterText}
          onFilterTextChanged={this.props.onFilterTextChanged}
          renderItem={this.renderItem}
          renderRowFocusTooltip={this.renderRowFocusTooltip}
          renderGroupHeader={this.renderGroupHeader}
          onItemClick={this.onItemClick}
          renderPostFilter={this.renderPostFilter}
          renderNoItems={this.renderNoItems}
          groups={groups}
          invalidationProps={{
            repositories: this.props.repositories,
            filterText: this.props.filterText,
            submodules: this.props.submodules,
            repositoryFolders: this.state.repositoryFolders,
          }}
          onItemContextMenu={this.onItemContextMenu}
          getGroupAriaLabel={this.getGroupAriaLabelGetter(groups)}
          getItemAriaLabel={this.getItemAriaLabel}
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }

  private onSelectionChanged = (selectedItem: IRepositoryListItem | null) => {
    this.setState({ selectedItem })
  }

  private renderPostFilter = () => {
    return (
      <Button
        className="new-repository-button"
        onClick={this.onNewRepositoryButtonClick}
        ariaExpanded={this.state.newRepositoryMenuExpanded}
        onKeyDown={this.onNewRepositoryButtonKeyDown}
      >
        Add
        <Octicon symbol={octicons.triangleDown} />
      </Button>
    )
  }

  private onNewRepositoryButtonKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>
  ) => {
    if (event.key === 'ArrowDown') {
      this.onNewRepositoryButtonClick()
    }
  }

  private renderNoItems = () => {
    return (
      <div className="no-items no-results-found">
        <img src={BlankSlateImage} className="blankslate-image" alt="" />
        <div className="title">Sorry, I can't find that repository</div>

        <div className="protip">
          ProTip! Press{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut darwinKeys={['⌘', 'O']} keys={['Ctrl', 'O']} />
          </div>{' '}
          to quickly add a local repository, and{' '}
          <div className="kbd-shortcut">
            <KeyboardShortcut
              darwinKeys={['⇧', '⌘', 'O']}
              keys={['Ctrl', 'Shift', 'O']}
            />
          </div>{' '}
          to clone from anywhere within the app
        </div>
      </div>
    )
  }

  private onNewRepositoryButtonClick = () => {
    const items: IMenuItem[] = [
      {
        label: __DARWIN__ ? 'New Folder…' : 'New folder…',
        action: this.onCreateRepositoryFolder,
      },
      { type: 'separator' },
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

    this.setState({ newRepositoryMenuExpanded: true })
    showContextualMenu(items).then(() => {
      this.setState({ newRepositoryMenuExpanded: false })
    })
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

  private onChangeRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.ChangeRepositoryAlias,
      repository,
    })
  }

  private onRemoveRepositoryAlias = (repository: Repository) => {
    this.props.dispatcher.changeRepositoryAlias(repository, null)
  }

  private updateRepositoryFolders = (
    repositoryFolders: IRepositoryFoldersState
  ) => {
    saveRepositoryFolders(repositoryFolders)
    this.setState({ repositoryFolders })
  }

  private onCreateRepositoryFolder = (repository?: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.RepositoryFolder,
      existingNames: this.state.repositoryFolders.folders,
      repositoryName:
        repository === undefined
          ? undefined
          : repository.alias ?? repository.name,
      onSubmit: name => {
        let repositoryFolders = createRepositoryFolder(
          this.state.repositoryFolders,
          name
        )

        if (repository !== undefined) {
          repositoryFolders = assignRepositoryFolder(
            repositoryFolders,
            repository,
            name
          )
        }

        this.updateRepositoryFolders(repositoryFolders)
      },
    })
  }

  private onMoveToRepositoryFolder = (
    repository: Repository,
    folder: string | null
  ) => {
    this.updateRepositoryFolders(
      assignRepositoryFolder(this.state.repositoryFolders, repository, folder)
    )
  }

  private onToggleRepositoryFolder = (folder: string) => {
    this.updateRepositoryFolders(
      toggleRepositoryFolder(this.state.repositoryFolders, folder)
    )
  }

  private onRepositoryFolderHeaderClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.stopPropagation()
    this.onToggleRepositoryFolder(event.currentTarget.value)
  }

  private onRepositoryFolderHeaderContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    this.onRepositoryFolderContextMenu(event.currentTarget.value, event)
  }

  private onRenameRepositoryFolder = (folder: string) => {
    this.props.dispatcher.showPopup({
      type: PopupType.RepositoryFolder,
      initialName: folder,
      existingNames: this.state.repositoryFolders.folders,
      onSubmit: name =>
        this.updateRepositoryFolders(
          renameRepositoryFolder(this.state.repositoryFolders, folder, name)
        ),
    })
  }

  private onDeleteRepositoryFolder = (folder: string) => {
    this.updateRepositoryFolders(
      deleteRepositoryFolder(this.state.repositoryFolders, folder)
    )
  }

  private onRepositoryFolderContextMenu = (
    folder: string,
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    event.preventDefault()
    event.stopPropagation()
    showContextualMenu([
      {
        label: __DARWIN__ ? 'Rename Folder…' : 'Rename folder…',
        action: () => this.onRenameRepositoryFolder(folder),
      },
      {
        label: __DARWIN__ ? 'Delete Folder' : 'Delete folder',
        action: () => this.onDeleteRepositoryFolder(folder),
      },
    ])
  }

  private onCreateWorktree = (repository: Repository) => {
    this.props.dispatcher.showPopup({
      type: PopupType.AddWorktree,
      repository,
    })
  }

  private onShowWorktrees = (repository: Repository) => {
    this.props.dispatcher.selectRepository(repository)
    this.props.dispatcher.showWorktreesFoldout()
  }
}
