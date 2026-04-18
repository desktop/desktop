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
import { Tooltip } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'
import memoizeOne from 'memoize-one'
import { KeyboardShortcut } from '../keyboard-shortcut/keyboard-shortcut'
import { generateRepositoryListContextMenu } from '../repositories-list/repository-list-item-context-menu'
import { assertNever } from '../../lib/fatal-error'
import { IAheadBehind } from '../../models/branch'
import { ICollectionWithChildren } from '../../models/collection'
import { CollectionTreeItem, DropPosition } from './collection-tree-item'
import classNames from 'classnames'
import { Row } from '../lib/row'
import { TextBox } from '../lib/text-box'
import { match as fuzzyMatch } from '../../lib/fuzzy-find'

const BlankSlateImage = encodePathAsUrl(__dirname, 'static/empty-no-repo.svg')

interface IRepositoriesListProps {
  readonly selectedRepository: Repositoryish | null
  readonly repositories: ReadonlyArray<Repositoryish>
  readonly recentRepositories: ReadonlyArray<number>

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

  /** Pre-built collection tree (roots). */
  readonly collections: ReadonlyArray<ICollectionWithChildren>

  /** IDs of repositories that live inside a collection (excluded from auto-groups). */
  readonly collectedRepositoryIds: ReadonlySet<number>
}

interface IRepositoriesListState {
  readonly newRepositoryMenuExpanded: boolean
  readonly renamingCollectionId: number | null
  readonly repoDropOnCollectedRepoId: number | null
  readonly repoDropPosition: 'before' | 'after' | null
  /**
   * During an active filter, the persisted isExpanded is force-overridden
   * to true. This set tracks collections the user has explicitly collapsed
   * during the filter so we can honour their override without mutating
   * the persisted state.
   */
  readonly filterCollapsedIds: ReadonlySet<number>
}

const REPO_MIME = 'application/x-repository-id'

interface IFlatRepositoryRowProps {
  readonly item: IRepositoryListItem
  readonly matches: IMatches
  readonly isSelected: boolean
  readonly renderTooltip: (
    item: IRepositoryListItem
  ) => JSX.Element | string | null
  readonly renderItem: (
    item: IRepositoryListItem,
    matches: IMatches
  ) => JSX.Element | null
  readonly onClick: (item: IRepositoryListItem) => void
  readonly onContextMenu: (
    item: IRepositoryListItem,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
}

class FlatRepositoryRow extends React.Component<IFlatRepositoryRowProps, {}> {
  private rowRef = createObservableRef<HTMLDivElement>()

  private onClick = () => this.props.onClick(this.props.item)

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu(this.props.item, e)
  }

  private onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.props.onClick(this.props.item)
    }
  }

  public render() {
    const { item, matches, isSelected, renderTooltip, renderItem } = this.props
    return (
      <div
        ref={this.rowRef}
        tabIndex={0}
        role="option"
        aria-selected={isSelected}
        className={classNames('list-item', 'repository-row', {
          selected: isSelected,
        })}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
        onContextMenu={this.onContextMenu}
      >
        <Tooltip target={this.rowRef}>{renderTooltip(item)}</Tooltip>
        {renderItem(item, matches)}
      </div>
    )
  }
}

interface ICollectedRepositoryRowProps {
  readonly repository: Repository
  readonly item: IRepositoryListItem
  readonly parentCollectionId: number
  readonly depth: number
  readonly repoState: ILocalRepositoryState | undefined
  readonly isSelected: boolean
  readonly dropIndicator: 'before' | 'after' | null
  readonly renderTooltip: (
    item: IRepositoryListItem
  ) => JSX.Element | string | null
  readonly onClick: (repository: Repository) => void
  readonly onContextMenu: (
    item: IRepositoryListItem,
    e: React.MouseEvent<HTMLDivElement>
  ) => void
  readonly onDragStart: (e: React.DragEvent, repository: Repository) => void
  readonly onDragOver: (e: React.DragEvent, repoId: number) => void
  readonly onDragLeave: () => void
  readonly onDrop: (
    e: React.DragEvent,
    targetRepoId: number,
    parentCollectionId: number
  ) => void
}

class CollectedRepositoryRow extends React.Component<
  ICollectedRepositoryRowProps,
  {}
> {
  private rowRef = createObservableRef<HTMLDivElement>()

  private onClick = () => this.props.onClick(this.props.repository)

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu(this.props.item, e)
  }

  private onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      this.props.onClick(this.props.repository)
    }
  }

  private onDragStart = (e: React.DragEvent) => {
    this.props.onDragStart(e, this.props.repository)
  }

  private onDragOver = (e: React.DragEvent) => {
    this.props.onDragOver(e, this.props.repository.id)
  }

  private onDrop = (e: React.DragEvent) => {
    this.props.onDrop(
      e,
      this.props.repository.id,
      this.props.parentCollectionId
    )
  }

  public render() {
    const { repository, item, depth, repoState, isSelected, dropIndicator } =
      this.props
    const indent = {
      paddingLeft: `calc(var(--spacing) + ${depth * 12}px)`,
    }
    return (
      <div
        ref={this.rowRef}
        tabIndex={0}
        role="option"
        aria-selected={isSelected}
        className={classNames('collected-repository', 'list-item', {
          selected: isSelected,
          'drop-before': dropIndicator === 'before',
          'drop-after': dropIndicator === 'after',
        })}
        style={indent}
        draggable={true}
        onDragStart={this.onDragStart}
        onDragOver={this.onDragOver}
        onDragLeave={this.props.onDragLeave}
        onDrop={this.onDrop}
        onClick={this.onClick}
        onKeyDown={this.onKeyDown}
        onContextMenu={this.onContextMenu}
      >
        <Tooltip target={this.rowRef}>{this.props.renderTooltip(item)}</Tooltip>
        <RepositoryListItem
          repository={repository}
          needsDisambiguation={false}
          matches={{ title: [], subtitle: [] }}
          aheadBehind={repoState?.aheadBehind ?? null}
          changedFilesCount={repoState?.changedFilesCount ?? 0}
        />
      </div>
    )
  }
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
      collected: ReadonlySet<number>
    ) =>
      repositories === null
        ? []
        : groupRepositories(
            repositories,
            localRepositoryStateLookup,
            recentRepositories,
            collected
          )
  )

  public constructor(props: IRepositoriesListProps) {
    super(props)

    this.state = {
      newRepositoryMenuExpanded: false,
      renamingCollectionId: null,
      repoDropOnCollectedRepoId: null,
      repoDropPosition: null,
      filterCollapsedIds: new Set(),
    }
  }

  public componentDidUpdate(prevProps: IRepositoriesListProps) {
    // Clear filter-scoped collapse overrides once the filter is empty again.
    if (
      prevProps.filterText !== this.props.filterText &&
      this.props.filterText.trim() === '' &&
      this.state.filterCollapsedIds.size > 0
    ) {
      this.setState({ filterCollapsedIds: new Set() })
    }
  }

  private renderItem = (item: IRepositoryListItem, matches: IMatches) => {
    const repository = item.repository
    return (
      <RepositoryListItem
        key={repository.id}
        repository={repository}
        needsDisambiguation={item.needsDisambiguation}
        matches={matches}
        aheadBehind={item.aheadBehind}
        changedFilesCount={item.changedFilesCount}
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
    const { repository, aheadBehind, changedFilesCount } = item
    const gitHubRepo =
      repository instanceof Repository ? repository.gitHubRepository : null
    const alias = repository instanceof Repository ? repository.alias : null
    const realName = gitHubRepo ? gitHubRepo.fullName : repository.name
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
          {repository.path}
        </div>
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
    } else {
      assertNever(kind, `Unknown repository group kind ${kind}`)
    }
  }

  private renderGroupHeader = (group: RepositoryListGroup) => {
    const label = this.getGroupLabel(group)

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

  private onItemClick = (item: IRepositoryListItem) => {
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
      onViewOnGitHub: this.props.onViewOnGitHub,
      repository: item.repository,
      shellLabel: this.props.shellLabel,
      collections: this.props.collections,
      onMoveToCollection: this.moveRepositoryToCollectionById,
    })

    showContextualMenu(items)
  }

  private moveRepositoryToCollectionById = (
    repositoryId: number,
    collectionId: number | null
  ) => {
    const repo = this.props.repositories.find(r => r.id === repositoryId)
    if (repo instanceof Repository) {
      this.props.dispatcher.moveRepositoryToCollection(repo, collectionId)
    }
  }

  public render() {
    const groups = this.getRepositoryGroups(
      this.props.repositories,
      this.props.localRepositoryStateLookup,
      this.props.recentRepositories,
      this.props.collectedRepositoryIds
    )

    const filterText = this.props.filterText.trim()
    const filteredGroups = this.filterGroups(groups, filterText)
    const hasItems = filteredGroups.some(g => g.items.length > 0)

    return (
      <div className="repository-list" onContextMenu={this.onPanelContextMenu}>
        <Row className="filter-field-row">
          <TextBox
            displayClearButton={true}
            prefixedIcon={octicons.search}
            autoFocus={true}
            placeholder="Filter"
            className="filter-list-filter-field"
            value={this.props.filterText}
            onValueChanged={this.props.onFilterTextChanged}
          />
          {this.renderPostFilter()}
        </Row>
        <div className="repository-list-scroll">
          {this.renderCollectionTree()}
          {!hasItems && filterText !== '' && this.renderNoItems()}
          {filteredGroups.map(({ group, items }) =>
            items.length === 0 ? null : (
              <div key={getGroupKey(group)} className="repository-list-group">
                {this.renderGroupHeader(group)}
                {items.map(({ item, matches }) =>
                  this.renderFlatRepositoryRow(item, matches)
                )}
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  private filterGroups(
    groups: ReadonlyArray<
      IFilterListGroup<IRepositoryListItem, RepositoryListGroup>
    >,
    filterText: string
  ): ReadonlyArray<{
    group: RepositoryListGroup
    items: ReadonlyArray<{ item: IRepositoryListItem; matches: IMatches }>
  }> {
    if (filterText === '') {
      return groups.map(g => ({
        group: g.identifier,
        items: g.items.map(item => ({
          item,
          matches: { title: [], subtitle: [] },
        })),
      }))
    }
    return groups.map(g => ({
      group: g.identifier,
      items: fuzzyMatch(filterText, g.items, item => item.text).map(m => ({
        item: m.item,
        matches: m.matches,
      })),
    }))
  }

  private renderFlatRepositoryRow = (
    item: IRepositoryListItem,
    matches: IMatches
  ): JSX.Element => {
    const isSelected = this.props.selectedRepository?.id === item.repository.id
    return (
      <FlatRepositoryRow
        key={`repo-${item.repository.id}`}
        item={item}
        matches={matches}
        isSelected={isSelected}
        renderTooltip={this.renderRowFocusTooltip}
        renderItem={this.renderItem}
        onClick={this.onItemClick}
        onContextMenu={this.onItemContextMenu}
      />
    )
  }

  private renderPostFilter = () => {
    return (
      <>
        <Button
          className="new-collection-button"
          onClick={this.onCreateRootCollection}
          tooltip="New Collection"
        >
          <Octicon symbol={octicons.fileDirectory} />
        </Button>
        <Button
          className="new-repository-button"
          onClick={this.onNewRepositoryButtonClick}
          ariaExpanded={this.state.newRepositoryMenuExpanded}
          onKeyDown={this.onNewRepositoryButtonKeyDown}
        >
          Add
          <Octicon symbol={octicons.triangleDown} />
        </Button>
      </>
    )
  }

  private onCreateRootCollection = async () => {
    const created = await this.props.dispatcher.createCollection(
      'New Collection',
      null
    )
    this.setState({ renamingCollectionId: created.id })
  }

  private onPanelContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (
      target.closest('.collection-tree-item') ||
      target.closest('.list-item') ||
      target.closest('.filter-list-group-header') ||
      target.closest('input') ||
      target.closest('button')
    ) {
      return
    }
    event.preventDefault()
    const items: IMenuItem[] = [
      {
        label: 'New Collection',
        action: this.onCreateRootCollection,
      },
    ]
    showContextualMenu(items)
  }

  private renderCollectionTree = (): JSX.Element | null => {
    const tree = this.applyFilterToTree(
      this.props.collections,
      this.props.filterText
    )
    if (tree.length === 0) {
      return null
    }
    return (
      <div className="collection-tree-section" role="tree">
        {tree.map(collection => this.renderCollectionNode(collection, 0))}
      </div>
    )
  }

  /**
   * Return a new tree where collections with no matching descendants are removed
   * and matching collections default to isExpanded=true. The persisted
   * expand/collapse state is preserved because we never call
   * setCollectionExpanded — this is a render-only override. The user can still
   * collapse a matching collection during filter; that collapse is tracked in
   * state.filterCollapsedIds and reset when the filter clears.
   */
  private applyFilterToTree(
    tree: ReadonlyArray<ICollectionWithChildren>,
    filter: string
  ): ReadonlyArray<ICollectionWithChildren> {
    if (filter === '') {
      return tree
    }
    const needle = filter.toLowerCase()

    const filterNode = (
      node: ICollectionWithChildren
    ): ICollectionWithChildren | null => {
      const nameMatches = node.name.toLowerCase().includes(needle)
      const matchingChildren = node.childCollections
        .map(filterNode)
        .filter((c): c is ICollectionWithChildren => c !== null)
      const matchingRepoIds = node.repositoryIds.filter(id => {
        const repo = this.props.repositories.find(r => r.id === id)
        if (!repo) {
          return false
        }
        const title =
          repo instanceof Repository ? repo.alias ?? repo.name : repo.name
        return title.toLowerCase().includes(needle)
      })

      if (
        !nameMatches &&
        matchingChildren.length === 0 &&
        matchingRepoIds.length === 0
      ) {
        return null
      }

      return {
        ...node,
        isExpanded: !this.state.filterCollapsedIds.has(node.id),
        childCollections: matchingChildren,
        repositoryIds: nameMatches ? node.repositoryIds : matchingRepoIds,
      }
    }

    return tree
      .map(filterNode)
      .filter((n): n is ICollectionWithChildren => n !== null)
  }

  private renderCollectionNode = (
    collection: ICollectionWithChildren,
    depth: number
  ): JSX.Element => {
    return (
      <React.Fragment key={`collection-${collection.id}`}>
        <CollectionTreeItem
          collection={collection}
          depth={depth}
          isRenaming={this.state.renamingCollectionId === collection.id}
          onToggleExpand={this.onToggleCollectionExpand}
          onRename={this.onRenameCollection}
          onCancelRename={this.onCancelRename}
          onRequestRename={this.onRequestRenameCollection}
          onContextMenu={this.onCollectionContextMenu}
          onRepositoryDropped={this.onRepositoryDroppedOnCollection}
          onCollectionDropped={this.onCollectionDroppedOnCollection}
        />
        {collection.isExpanded && (
          <div className="collection-children">
            {collection.childCollections.map(child =>
              this.renderCollectionNode(child, depth + 1)
            )}
            {collection.repositoryIds.map(repoId =>
              this.renderCollectedRepo(repoId, depth + 1, collection.id)
            )}
          </div>
        )}
      </React.Fragment>
    )
  }

  private renderCollectedRepo = (
    repoId: number,
    depth: number,
    parentFolderId: number
  ): JSX.Element | null => {
    const repository = this.props.repositories.find(r => r.id === repoId)
    if (!repository || !(repository instanceof Repository)) {
      return null
    }
    const repoState = this.props.localRepositoryStateLookup.get(repoId)
    const isSelected = this.props.selectedRepository?.id === repoId
    const dropIndicator =
      this.state.repoDropOnCollectedRepoId === repoId
        ? this.state.repoDropPosition
        : null

    const item: IRepositoryListItem = {
      text: [repository.alias ?? repository.name],
      id: String(repoId),
      repository,
      needsDisambiguation: false,
      aheadBehind: repoState?.aheadBehind ?? null,
      changedFilesCount: repoState?.changedFilesCount ?? 0,
    }

    return (
      <CollectedRepositoryRow
        key={`collected-repo-${repoId}`}
        repository={repository}
        item={item}
        parentCollectionId={parentFolderId}
        depth={depth}
        repoState={repoState}
        isSelected={isSelected}
        dropIndicator={dropIndicator}
        renderTooltip={this.renderRowFocusTooltip}
        onClick={this.props.onSelectionChanged}
        onContextMenu={this.onItemContextMenu}
        onDragStart={this.onCollectedRepoDragStart}
        onDragOver={this.onCollectedRepoDragOver}
        onDragLeave={this.onCollectedRepoDragLeave}
        onDrop={this.onCollectedRepoDrop}
      />
    )
  }

  private onCollectedRepoDragStart = (
    e: React.DragEvent,
    repository: Repository
  ) => {
    e.dataTransfer.setData(REPO_MIME, String(repository.id))
    e.dataTransfer.effectAllowed = 'move'
  }

  private onCollectedRepoDragOver = (e: React.DragEvent, repoId: number) => {
    if (!e.dataTransfer.types.includes(REPO_MIME)) {
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const el = e.currentTarget as HTMLElement
    const rect = el.getBoundingClientRect()
    const midpoint = rect.top + rect.height / 2
    const pos = e.clientY < midpoint ? 'before' : 'after'
    if (
      this.state.repoDropOnCollectedRepoId !== repoId ||
      this.state.repoDropPosition !== pos
    ) {
      this.setState({
        repoDropOnCollectedRepoId: repoId,
        repoDropPosition: pos,
      })
    }
  }

  private onCollectedRepoDragLeave = () => {
    if (this.state.repoDropOnCollectedRepoId !== null) {
      this.setState({
        repoDropOnCollectedRepoId: null,
        repoDropPosition: null,
      })
    }
  }

  private onCollectedRepoDrop = (
    e: React.DragEvent,
    targetRepoId: number,
    collectionId: number
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = this.state.repoDropPosition ?? 'before'
    this.setState({ repoDropOnCollectedRepoId: null, repoDropPosition: null })

    const draggedId = parseInt(e.dataTransfer.getData(REPO_MIME), 10)
    if (Number.isNaN(draggedId) || draggedId === targetRepoId) {
      return
    }

    const draggedRepo = this.props.repositories.find(r => r.id === draggedId)
    if (!(draggedRepo instanceof Repository)) {
      return
    }

    const siblings = this.siblingOrderedRepoIds(collectionId)
    if (!siblings.includes(draggedId)) {
      // Dragging from outside the collection → move in, then reorder
      this.props.dispatcher
        .moveRepositoryToCollection(draggedRepo, collectionId)
        .then(() => {
          const fresh = this.siblingOrderedRepoIds(collectionId)
          const targetIdx = fresh.indexOf(targetRepoId)
          if (targetIdx < 0) {
            return
          }
          const newIndex = pos === 'before' ? targetIdx : targetIdx + 1
          return this.props.dispatcher.reorderRepositoryInCollection(
            draggedId,
            collectionId,
            newIndex
          )
        })
      return
    }

    const targetIdx = siblings.indexOf(targetRepoId)
    if (targetIdx < 0) {
      return
    }
    let newIndex = pos === 'before' ? targetIdx : targetIdx + 1
    const currentIdx = siblings.indexOf(draggedId)
    if (currentIdx < newIndex) {
      newIndex -= 1
    }
    this.props.dispatcher.reorderRepositoryInCollection(
      draggedId,
      collectionId,
      newIndex
    )
  }

  private siblingOrderedRepoIds(collectionId: number): number[] {
    const find = (
      nodes: ReadonlyArray<ICollectionWithChildren>
    ): ICollectionWithChildren | null => {
      for (const n of nodes) {
        if (n.id === collectionId) {
          return n
        }
        const child = find(n.childCollections)
        if (child) {
          return child
        }
      }
      return null
    }
    const node = find(this.props.collections)
    return node ? [...node.repositoryIds] : []
  }

  private onToggleCollectionExpand = (collection: ICollectionWithChildren) => {
    const filterActive = this.props.filterText.trim() !== ''
    if (filterActive) {
      const next = new Set(this.state.filterCollapsedIds)
      if (collection.isExpanded) {
        next.add(collection.id)
      } else {
        next.delete(collection.id)
      }
      this.setState({ filterCollapsedIds: next })
      return
    }
    this.props.dispatcher.setCollectionExpanded(
      collection.id,
      !collection.isExpanded
    )
  }

  private onRepositoryDroppedOnCollection = (
    collection: ICollectionWithChildren,
    repositoryId: number,
    _position: DropPosition
  ) => {
    const repo = this.props.repositories.find(r => r.id === repositoryId)
    if (repo instanceof Repository) {
      this.props.dispatcher.moveRepositoryToCollection(repo, collection.id)
    }
  }

  private onCollectionDroppedOnCollection = (
    target: ICollectionWithChildren,
    draggedFolderId: number,
    position: DropPosition
  ) => {
    if (draggedFolderId === target.id) {
      return
    }

    if (position === 'into') {
      this.props.dispatcher.moveCollection(draggedFolderId, target.id)
      return
    }

    const { parent, siblings } = this.findParentAndSiblings(target.id)
    const targetIndex = siblings.findIndex(s => s.id === target.id)
    if (targetIndex < 0) {
      return
    }

    const sameParentSiblings = siblings.map(s => s.id)
    const fromIndex = sameParentSiblings.indexOf(draggedFolderId)
    const targetParentId = parent?.id ?? null

    // If the dragged collection isn't already a sibling, move it under target's parent first.
    const moveIfNeeded = async () => {
      if (fromIndex < 0) {
        await this.props.dispatcher.moveCollection(
          draggedFolderId,
          targetParentId
        )
      }
    }

    moveIfNeeded().then(() => {
      const fresh = this.findParentAndSiblings(target.id).siblings
      const targetIdx = fresh.findIndex(s => s.id === target.id)
      if (targetIdx < 0) {
        return
      }
      let insertAt = position === 'before' ? targetIdx : targetIdx + 1
      const currentIdx = fresh.findIndex(s => s.id === draggedFolderId)
      if (currentIdx >= 0 && currentIdx < insertAt) {
        insertAt -= 1
      }
      this.props.dispatcher.reorderCollection(draggedFolderId, insertAt)
    })
  }

  private findParentAndSiblings(id: number): {
    parent: ICollectionWithChildren | null
    siblings: ReadonlyArray<ICollectionWithChildren>
  } {
    const roots = this.props.collections
    for (const r of roots) {
      if (r.id === id) {
        return { parent: null, siblings: roots }
      }
    }
    const walk = (
      nodes: ReadonlyArray<ICollectionWithChildren>
    ): {
      parent: ICollectionWithChildren
      siblings: ReadonlyArray<ICollectionWithChildren>
    } | null => {
      for (const node of nodes) {
        if (node.childCollections.some(c => c.id === id)) {
          return { parent: node, siblings: node.childCollections }
        }
        const deep = walk(node.childCollections)
        if (deep) {
          return deep
        }
      }
      return null
    }
    const result = walk(roots)
    return result ?? { parent: null, siblings: roots }
  }

  private onRequestRenameCollection = (collection: ICollectionWithChildren) => {
    this.setState({ renamingCollectionId: collection.id })
  }

  private onRenameCollection = (
    collection: ICollectionWithChildren,
    newName: string
  ) => {
    this.props.dispatcher.renameCollection(collection.id, newName)
    this.setState({ renamingCollectionId: null })
  }

  private onCancelRename = () => {
    this.setState({ renamingCollectionId: null })
  }

  private onCollectionContextMenu = (
    collection: ICollectionWithChildren,
    event: React.MouseEvent
  ) => {
    event.preventDefault()
    const items: IMenuItem[] = [
      {
        label: 'New Sub-collection',
        action: async () => {
          const created = await this.props.dispatcher.createCollection(
            'New Collection',
            collection.id
          )
          this.setState({ renamingCollectionId: created.id })
        },
      },
      { type: 'separator' },
      {
        label: 'Rename',
        action: () => this.setState({ renamingCollectionId: collection.id }),
      },
      {
        label: 'Delete Collection',
        action: () => this.confirmDeleteCollection(collection),
      },
    ]
    showContextualMenu(items)
  }

  private confirmDeleteCollection = (collection: ICollectionWithChildren) => {
    const isEmpty =
      collection.childCollections.length === 0 &&
      collection.repositoryIds.length === 0
    if (isEmpty) {
      this.props.dispatcher.deleteCollection(collection.id)
      return
    }
    const confirmed = window.confirm(
      `Delete "${collection.name}"? Repositories and subfolders will be moved to the parent level.`
    )
    if (confirmed) {
      this.props.dispatcher.deleteCollection(collection.id)
    }
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
}
