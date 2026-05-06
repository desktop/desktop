import * as React from 'react'
import classNames from 'classnames'

import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { FavouriteGroup } from '../../models/favourite-group'
import { Dispatcher } from '../dispatcher'
import { Octicon, iconForRepository } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { showContextualMenu, IMenuItem } from '../../lib/menu-item'
import { PopupType } from '../../models/popup'

// Header (label + add-group button) lives in the toolbar; see
// FavouritesToolbarSegment.

interface IFavouritesSidebarProps {
  readonly repositories: ReadonlyArray<Repository>
  readonly favouriteGroups: ReadonlyArray<FavouriteGroup>
  readonly selectedRepository: Repository | CloningRepository | null
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
            className={classNames('favourites-sidebar-tab', {
              active: g.id === activeGroupId,
            })}
            onClick={() => this.props.onActiveGroupChanged(g.id)}
            onContextMenu={event => this.onTabContextMenu(event, g)}
            title={g.name}
          >
            {g.name}
          </button>
        ))}
      </div>
    )
  }

  private renderEmptyState() {
    return (
      <p className="favourites-sidebar-empty">
        Right-click a repository and choose <strong>Add to favourites</strong>{' '}
        to pin it here. You can organise pins into groups (e.g. Work,
        Personal).
      </p>
    )
  }

  private renderActiveGroupList() {
    const { repositories, favouriteGroups, activeGroupId } = this.props

    const effectiveGroupId =
      activeGroupId ?? favouriteGroups[0]?.id ?? null

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

    return (
      <ul className="favourites-sidebar-list">
        {repositories.map(repo => {
          const isSelected = repo.id === selectedId
          const label = repo.alias ?? repo.name
          return (
            <li
              key={repo.id}
              className={classNames('favourites-sidebar-item', {
                selected: isSelected,
              })}
            >
              <button
                type="button"
                className="favourites-sidebar-item-button"
                onClick={() => this.onSelect(repo)}
                aria-current={isSelected ? 'true' : undefined}
                title={label}
              >
                <Octicon
                  className="icon-for-repository"
                  symbol={iconForRepository(repo)}
                />
                <span className="favourites-sidebar-item-name">{label}</span>
              </button>
              <button
                type="button"
                className="favourites-sidebar-unfavourite"
                onClick={event => this.onUnfavourite(event, repo)}
                aria-label={`Remove ${label} from favourites`}
                title="Remove from favourites"
              >
                <Octicon symbol={octicons.starFill} />
              </button>
            </li>
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

  private onTabContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    group: FavouriteGroup
  ) => {
    event.preventDefault()
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

    const message =
      memberCount === 0
        ? `Delete the favourites group "${group.name}"?`
        : `Delete "${group.name}"? Its ${memberCount} repositor${
            memberCount === 1 ? 'y' : 'ies'
          } will no longer be favourites.`

    if (window.confirm(message)) {
      this.props.dispatcher.deleteFavouriteGroup(group.id)
    }
  }
}
