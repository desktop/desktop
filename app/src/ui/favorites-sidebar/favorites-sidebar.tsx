import * as React from 'react'
import classNames from 'classnames'
import memoizeOne from 'memoize-one'

import { ILocalRepositoryState, Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { FavoriteGroup } from '../../models/favorite-group'
import { IAheadBehind } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import {
  renderRepoIndicators,
  renderRepositoryRowFocusTooltip,
} from '../repositories-list/repository-list-item'
import { Tooltip } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'

const favoritesPanelId = 'favorites-sidebar-panel'
const favoritesTabId = (groupId: number) => `favorites-sidebar-tab-${groupId}`

interface IFavoritesSidebarItemProps {
  readonly repository: Repository
  readonly isSelected: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly onSelect: (repository: Repository) => void
  readonly onShowContextMenu: (repository: Repository) => void
}

class FavoritesSidebarItem extends React.Component<
  IFavoritesSidebarItemProps,
  {}
> {
  private readonly itemRef = createObservableRef<HTMLLIElement>()

  public render() {
    const { repository, isSelected, aheadBehind, changedFilesCount } =
      this.props
    const label = repository.alias ?? repository.name
    const hasChanges = changedFilesCount > 0

    return (
      <li
        ref={this.itemRef}
        className={classNames('favorites-sidebar-item', {
          selected: isSelected,
        })}
        onContextMenu={this.onContextMenu}
      >
        <Tooltip target={this.itemRef}>
          {renderRepositoryRowFocusTooltip({
            repository,
            aheadBehind,
            changedFilesCount,
          })}
        </Tooltip>
        <button
          type="button"
          className="favorites-sidebar-item-button"
          onClick={this.onClick}
          aria-current={isSelected ? 'true' : undefined}
        >
          <span className="favorites-sidebar-item-name">{label}</span>
        </button>
        {renderRepoIndicators({ aheadBehind, hasChanges })}
      </li>
    )
  }

  private onClick = () => this.props.onSelect(this.props.repository)

  private onContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault()
    this.props.onShowContextMenu(this.props.repository)
  }
}

interface IFavoritesSidebarProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly favoriteGroups: ReadonlyArray<FavoriteGroup>
  readonly selectedRepository: Repository | CloningRepository | null
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >
  readonly dispatcher: Dispatcher
  readonly activeGroupId: number | null
  readonly onActiveGroupChanged: (id: number | null) => void
  /**
   * Show the row's right-click context menu (mirrors the menu shown when
   * right-clicking the Current Repository toolbar button).
   */
  readonly onShowRepositoryContextMenu: (repository: Repository) => void
}

export class FavoritesSidebar extends React.Component<
  IFavoritesSidebarProps,
  {}
> {
  /**
   * Filter+sort the active group's members. Cached on
   * `(repositories, effectiveGroupId)` so unrelated re-renders (e.g.
   * keystrokes in the global filter) skip the work.
   */
  private readonly getMembers = memoizeOne(
    (
      repositories: ReadonlyArray<Repository>,
      effectiveGroupId: number
    ): ReadonlyArray<Repository> =>
      repositories
        .filter(r => r.favoriteGroupId === effectiveGroupId)
        .slice()
        .sort((a, b) =>
          (a.alias ?? a.name).localeCompare(b.alias ?? b.name, undefined, {
            sensitivity: 'base',
          })
        )
  )

  public render() {
    const { favoriteGroups } = this.props
    const showTabs = favoriteGroups.length >= 2
    const effectiveGroupId = this.resolveEffectiveGroupId()

    return (
      <nav className="favorites-sidebar" aria-label="Favorite repositories">
        {showTabs && this.renderTabs(effectiveGroupId)}
        {favoriteGroups.length === 0
          ? this.renderEmptyState()
          : this.renderActiveGroupList(effectiveGroupId)}
      </nav>
    )
  }

  private renderTabs(effectiveGroupId: number | null) {
    const { favoriteGroups } = this.props
    return (
      <div
        className="favorites-sidebar-tabs"
        role="tablist"
        aria-label="Favorite groups"
      >
        {favoriteGroups.map(g => {
          const selected = g.id === effectiveGroupId
          return (
            <button
              key={g.id}
              role="tab"
              id={favoritesTabId(g.id)}
              aria-selected={selected}
              aria-controls={favoritesPanelId}
              tabIndex={selected ? 0 : -1}
              data-group-id={g.id}
              className={classNames('favorites-sidebar-tab', {
                active: selected,
              })}
              onClick={this.onTabClick}
              onKeyDown={this.onTabKeyDown}
              onContextMenu={this.onTabContextMenu}
            >
              {g.name}
            </button>
          )
        })}
      </div>
    )
  }

  /**
   * Mirror of the store's `resolveActiveFavoritesGroupId` so the sidebar can
   * derive the same fallback (first group) without a separate prop. Kept
   * private so the toolbar count etc. continue to use the upstream value.
   */
  private resolveEffectiveGroupId(): number | null {
    const { activeGroupId, favoriteGroups } = this.props
    if (activeGroupId !== null && favoriteGroups.some(g => g.id === activeGroupId)) {
      return activeGroupId
    }
    return favoriteGroups[0]?.id ?? null
  }

  private onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const { favoriteGroups } = this.props
    if (favoriteGroups.length === 0) {
      return
    }

    const currentId = Number(event.currentTarget.dataset.groupId)
    const currentIndex = favoriteGroups.findIndex(g => g.id === currentId)
    if (currentIndex < 0) {
      return
    }

    let nextIndex: number | null = null
    switch (event.key) {
      case 'ArrowLeft':
        nextIndex =
          (currentIndex - 1 + favoriteGroups.length) % favoriteGroups.length
        break
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % favoriteGroups.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = favoriteGroups.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextGroup = favoriteGroups[nextIndex]
    this.props.onActiveGroupChanged(nextGroup.id)
    this.focusTab(nextGroup.id)
  }

  private focusTab(groupId: number) {
    // Defer focus to the next tick so the parent's render with the new
    // tabIndex roving has landed before we move focus.
    requestAnimationFrame(() => {
      const el = document.getElementById(favoritesTabId(groupId))
      if (el instanceof HTMLElement) {
        el.focus()
      }
    })
  }

  private getGroupFromEvent(
    event: React.SyntheticEvent<HTMLButtonElement>
  ): FavoriteGroup | null {
    const id = Number(event.currentTarget.dataset.groupId)
    return this.props.favoriteGroups.find(g => g.id === id) ?? null
  }

  private onTabClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const group = this.getGroupFromEvent(event)
    if (group !== null) {
      this.props.onActiveGroupChanged(group.id)
    }
  }

  private renderEmptyState() {
    return (
      <p className="favorites-sidebar-empty">
        Click the star next to a repository (or right-click for{' '}
        <strong>Add to favorites</strong>) to pin it here. You can organize pins
        into groups (e.g. Work, Personal).
      </p>
    )
  }

  private renderActiveGroupList(effectiveGroupId: number | null) {
    if (effectiveGroupId === null) {
      return this.renderEmptyState()
    }

    const members = this.getMembers(this.props.repositories, effectiveGroupId)

    const labelledBy = this.props.favoriteGroups.length >= 2
      ? favoritesTabId(effectiveGroupId)
      : undefined

    if (members.length === 0) {
      return (
        <p
          id={favoritesPanelId}
          role="tabpanel"
          aria-labelledby={labelledBy}
          className="favorites-sidebar-empty"
        >
          No repositories pinned to this group yet.
        </p>
      )
    }

    return this.renderList(members, effectiveGroupId)
  }

  private renderList(
    repositories: ReadonlyArray<Repository>,
    effectiveGroupId: number
  ) {
    const selectedId = this.props.selectedRepository?.id ?? null
    const stateLookup = this.props.localRepositoryStateLookup
    const labelledBy = this.props.favoriteGroups.length >= 2
      ? favoritesTabId(effectiveGroupId)
      : undefined

    return (
      <ul
        id={favoritesPanelId}
        role="tabpanel"
        aria-labelledby={labelledBy}
        className="favorites-sidebar-list"
      >
        {repositories.map(repo => {
          const localState = stateLookup.get(repo.id)
          return (
            <FavoritesSidebarItem
              key={repo.id}
              repository={repo}
              isSelected={repo.id === selectedId}
              aheadBehind={localState?.aheadBehind ?? null}
              changedFilesCount={localState?.changedFilesCount ?? 0}
              onSelect={this.onSelect}
              onShowContextMenu={this.props.onShowRepositoryContextMenu}
            />
          )
        })}
      </ul>
    )
  }

  private onSelect = (repository: Repository) => {
    const { dispatcher } = this.props
    dispatcher.recordRepoClicked(false)
    dispatcher.selectRepository(repository)
  }

  private onTabContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const group = this.getGroupFromEvent(event)
    if (group === null) {
      return
    }
    const items: ReadonlyArray<IMenuItem> = [
      {
        label: __DARWIN__ ? 'Rename Group…' : 'Rename group…',
        action: () =>
          this.props.dispatcher.showPopup({
            type: PopupType.RenameFavoriteGroup,
            groupId: group.id,
            currentName: group.name,
          }),
      },
      { type: 'separator' },
      {
        label: __DARWIN__ ? 'Delete Group' : 'Delete group',
        action: () => this.confirmDeleteGroup(group),
      },
    ]
    showContextualMenu(items)
  }

  private confirmDeleteGroup = (group: FavoriteGroup) => {
    const memberCount = this.props.repositories.filter(
      r => r.favoriteGroupId === group.id
    ).length

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDeleteFavoriteGroup,
      groupId: group.id,
      groupName: group.name,
      memberCount,
    })
  }
}
