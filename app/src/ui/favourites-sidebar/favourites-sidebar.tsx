import * as React from 'react'
import classNames from 'classnames'

import { ILocalRepositoryState, Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { FavouriteGroup } from '../../models/favourite-group'
import { IAheadBehind } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'
import {
  renderRepoIndicators,
  renderRepositoryRowFocusTooltip,
} from '../repositories-list/repository-list-item'
import { Tooltip } from '../lib/tooltip'
import { createObservableRef } from '../lib/observable-ref'

interface IFavouritesSidebarItemProps {
  readonly repository: Repository
  readonly isSelected: boolean
  readonly aheadBehind: IAheadBehind | null
  readonly changedFilesCount: number
  readonly onSelect: (repository: Repository) => void
  readonly onUnfavourite: (
    event: React.MouseEvent<HTMLElement>,
    repository: Repository
  ) => void
}

class FavouritesSidebarItem extends React.Component<
  IFavouritesSidebarItemProps,
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
        className={classNames('favourites-sidebar-item', {
          selected: isSelected,
        })}
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
          className="favourites-sidebar-item-button"
          onClick={this.onClick}
          aria-current={isSelected ? 'true' : undefined}
        >
          <Octicon
            className="icon-for-repository"
            symbol={iconForRepository(repository)}
          />
          <span className="favourites-sidebar-item-name">{label}</span>
        </button>
        {renderRepoIndicators({ aheadBehind, hasChanges })}
        <button
          type="button"
          className="favourites-sidebar-unfavourite"
          onClick={this.onUnfavouriteClick}
          aria-label={`Remove ${label} from favourites`}
        >
          <Octicon symbol={octicons.starFill} />
        </button>
      </li>
    )
  }

  private onClick = () => this.props.onSelect(this.props.repository)

  private onUnfavouriteClick = (event: React.MouseEvent<HTMLElement>) =>
    this.props.onUnfavourite(event, this.props.repository)
}

interface IFavouritesSidebarProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly favouriteGroups: ReadonlyArray<FavouriteGroup>
  readonly selectedRepository: Repository | CloningRepository | null
  readonly localRepositoryStateLookup: ReadonlyMap<
    number,
    ILocalRepositoryState
  >
  readonly dispatcher: Dispatcher
  readonly activeGroupId: number | null
  readonly onActiveGroupChanged: (id: number | null) => void
}

export class FavouritesSidebar extends React.Component<
  IFavouritesSidebarProps,
  {}
> {
  public render() {
    const { favouriteGroups } = this.props
    const showTabs = favouriteGroups.length >= 2

    return (
      <nav className="favourites-sidebar" aria-label="Favourite repositories">
        {showTabs && this.renderTabs()}
        {favouriteGroups.length === 0
          ? this.renderEmptyState()
          : this.renderActiveGroupList()}
      </nav>
    )
  }

  private renderTabs() {
    const { favouriteGroups, activeGroupId } = this.props
    return (
      <div className="favourites-sidebar-tabs" role="tablist">
        {favouriteGroups.map(g => (
          <button
            key={g.id}
            role="tab"
            aria-selected={g.id === activeGroupId}
            aria-label={g.name}
            data-group-id={g.id}
            className={classNames('favourites-sidebar-tab', {
              active: g.id === activeGroupId,
            })}
            onClick={this.onTabClick}
            onContextMenu={this.onTabContextMenu}
          >
            {g.name}
          </button>
        ))}
      </div>
    )
  }

  private getGroupFromEvent(
    event: React.SyntheticEvent<HTMLButtonElement>
  ): FavouriteGroup | null {
    const idStr = event.currentTarget.dataset.groupId
    const id = idStr === undefined ? NaN : parseInt(idStr, 10)
    return this.props.favouriteGroups.find(g => g.id === id) ?? null
  }

  private onTabClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    const group = this.getGroupFromEvent(event)
    if (group !== null) {
      this.props.onActiveGroupChanged(group.id)
    }
  }

  private renderEmptyState() {
    return (
      <p className="favourites-sidebar-empty">
        Right-click a repository and choose <strong>Add to favourites</strong>{' '}
        to pin it here. You can organise pins into groups (e.g. Work, Personal).
      </p>
    )
  }

  private renderActiveGroupList() {
    const { repositories, favouriteGroups, activeGroupId } = this.props

    const effectiveGroupId = activeGroupId ?? favouriteGroups[0]?.id ?? null

    if (effectiveGroupId === null) {
      return this.renderEmptyState()
    }

    const members = repositories
      .filter(r => r.favouriteGroupId === effectiveGroupId)
      .slice()
      .sort((a, b) =>
        (a.alias ?? a.name).localeCompare(b.alias ?? b.name, undefined, {
          sensitivity: 'base',
        })
      )

    if (members.length === 0) {
      return (
        <p className="favourites-sidebar-empty">
          No repositories pinned to this group yet.
        </p>
      )
    }

    return this.renderList(members)
  }

  private renderList(repositories: ReadonlyArray<Repository>) {
    const selectedId = this.props.selectedRepository?.id ?? null
    const stateLookup = this.props.localRepositoryStateLookup

    return (
      <ul className="favourites-sidebar-list">
        {repositories.map(repo => {
          const localState = stateLookup.get(repo.id)
          return (
            <FavouritesSidebarItem
              key={repo.id}
              repository={repo}
              isSelected={repo.id === selectedId}
              aheadBehind={localState?.aheadBehind ?? null}
              changedFilesCount={localState?.changedFilesCount ?? 0}
              onSelect={this.onSelect}
              onUnfavourite={this.onUnfavourite}
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

  private onUnfavourite = (
    event: React.MouseEvent<HTMLElement>,
    repository: Repository
  ) => {
    event.stopPropagation()
    event.preventDefault()
    this.props.dispatcher.setRepositoryFavouriteGroup(repository, null)
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
            type: PopupType.RenameFavouriteGroup,
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

  private confirmDeleteGroup = (group: FavouriteGroup) => {
    const memberCount = this.props.repositories.filter(
      r => r.favouriteGroupId === group.id
    ).length

    this.props.dispatcher.showPopup({
      type: PopupType.ConfirmDeleteFavouriteGroup,
      groupId: group.id,
      groupName: group.name,
      memberCount,
    })
  }
}
