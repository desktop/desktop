import { Repository } from '../../models/repository'
import { FavoriteGroup } from '../../models/favorite-group'
import { IMenuItem } from '../../lib/menu-item'
import { Repositoryish } from './group-repositories'
import { clipboard } from 'electron'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
  DefaultShellLabel,
} from '../lib/context-menu'
import { MaxFavoriteTabs } from '../../lib/stores/app-store'

interface IRepositoryListItemContextMenuConfig {
  repository: Repositoryish
  shellLabel: string | undefined
  externalEditorLabel: string | undefined
  askForConfirmationOnRemoveRepository: boolean
  favoriteGroups: ReadonlyArray<FavoriteGroup>
  onViewOnGitHub: (repository: Repositoryish) => void
  onOpenInShell: (repository: Repositoryish) => void
  onShowRepository: (repository: Repositoryish) => void
  onOpenInExternalEditor: (repository: Repositoryish) => void
  onRemoveRepository: (repository: Repositoryish) => void
  onChangeRepositoryAlias: (repository: Repository) => void
  onRemoveRepositoryAlias: (repository: Repository) => void
  onSetRepositoryFavoriteGroup: (
    repository: Repository,
    favoriteGroupId: number | null
  ) => void
  onCreateFavoriteGroupForRepository: (repository: Repository) => void
}

export const generateRepositoryListContextMenu = (
  config: IRepositoryListItemContextMenuConfig
) => {
  const { repository } = config
  const missing = repository instanceof Repository && repository.missing
  const github =
    repository instanceof Repository && repository.gitHubRepository != null
  const openInExternalEditor = config.externalEditorLabel
    ? `Open in ${config.externalEditorLabel}`
    : DefaultEditorLabel
  const openInShell = config.shellLabel
    ? `Open in ${config.shellLabel}`
    : DefaultShellLabel

  const items: ReadonlyArray<IMenuItem> = [
    ...buildAliasMenuItems(config),
    ...buildFavoriteMenuItems(config),
    {
      label: __DARWIN__ ? 'Copy Repo Name' : 'Copy repo name',
      action: () => clipboard.writeText(repository.name),
    },
    {
      label: __DARWIN__ ? 'Copy Repo Path' : 'Copy repo path',
      action: () => clipboard.writeText(repository.path),
    },
    { type: 'separator' },
    {
      label: 'View on GitHub',
      action: () => config.onViewOnGitHub(repository),
      enabled: github,
    },
    {
      label: openInShell,
      action: () => config.onOpenInShell(repository),
      enabled: !missing,
    },
    {
      label: RevealInFileManagerLabel,
      action: () => config.onShowRepository(repository),
      enabled: !missing,
    },
    {
      label: openInExternalEditor,
      action: () => config.onOpenInExternalEditor(repository),
      enabled: !missing,
    },
    { type: 'separator' },
    {
      label: config.askForConfirmationOnRemoveRepository ? 'Remove…' : 'Remove',
      action: () => config.onRemoveRepository(repository),
    },
  ]

  return items
}

const buildAliasMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  const verb = repository.alias == null ? 'Create' : 'Change'
  const items: Array<IMenuItem> = [
    {
      label: __DARWIN__ ? `${verb} Alias` : `${verb} alias`,
      action: () => config.onChangeRepositoryAlias(repository),
    },
  ]

  if (repository.alias !== null) {
    items.push({
      label: __DARWIN__ ? 'Remove Alias' : 'Remove alias',
      action: () => config.onRemoveRepositoryAlias(repository),
    })
  }

  return items
}

interface IFavoriteAssignmentConfig {
  /**
   * When true, render each group as a checkbox row checked when the
   * repository currently belongs to it. Used when the menu is presented
   * as the primary action target (e.g. the row's star-toggle picker).
   */
  readonly showCheckboxes: boolean
  readonly onSetRepositoryFavoriteGroup: (
    repository: Repository,
    favoriteGroupId: number | null
  ) => void
  readonly onCreateFavoriteGroupForRepository: (repository: Repository) => void
}

/**
 * Build the shared "group list + 'New group...'" body that both the
 * row-context-menu submenus and the star-toggle picker need. The order is
 * always: each group, separator, "New group...".
 */
export function buildFavoriteAssignmentItems(
  repository: Repository,
  favoriteGroups: ReadonlyArray<FavoriteGroup>,
  config: IFavoriteAssignmentConfig
): Array<IMenuItem> {
  const items: Array<IMenuItem> = favoriteGroups.map(g =>
    config.showCheckboxes
      ? {
          label: g.name,
          type: 'checkbox',
          checked: g.id === repository.favoriteGroupId,
          action: () => config.onSetRepositoryFavoriteGroup(repository, g.id),
        }
      : {
          label: g.name,
          action: () => config.onSetRepositoryFavoriteGroup(repository, g.id),
        }
  )

  // Once the cap is reached, omit "New Group…" entirely — the user already
  // has groups to pick from, so a disabled item would be noise.
  if (favoriteGroups.length >= MaxFavoriteTabs) {
    return items
  }

  if (favoriteGroups.length > 0) {
    items.push({ type: 'separator' })
  }

  items.push({
    label: __DARWIN__ ? 'New Group…' : 'New group…',
    action: () => config.onCreateFavoriteGroupForRepository(repository),
  })

  return items
}

const buildFavoriteMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, favoriteGroups } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  if (repository.isFavorite) {
    const items: Array<IMenuItem> = []
    if (favoriteGroups.length > 0) {
      items.push({
        label: __DARWIN__ ? 'Move to Group' : 'Move to group',
        submenu: buildFavoriteAssignmentItems(repository, favoriteGroups, {
          showCheckboxes: true,
          onSetRepositoryFavoriteGroup: config.onSetRepositoryFavoriteGroup,
          onCreateFavoriteGroupForRepository:
            config.onCreateFavoriteGroupForRepository,
        }),
      })
    }
    items.push({
      label: __DARWIN__ ? 'Remove from Favorites' : 'Remove from favorites',
      action: () => config.onSetRepositoryFavoriteGroup(repository, null),
    })
    return items
  }

  if (favoriteGroups.length === 0) {
    return [
      {
        label: __DARWIN__ ? 'Add to Favorites…' : 'Add to favorites…',
        action: () => config.onCreateFavoriteGroupForRepository(repository),
      },
    ]
  }

  return [
    {
      label: __DARWIN__ ? 'Add to Favorites' : 'Add to favorites',
      submenu: buildFavoriteAssignmentItems(repository, favoriteGroups, {
        showCheckboxes: false,
        onSetRepositoryFavoriteGroup: config.onSetRepositoryFavoriteGroup,
        onCreateFavoriteGroupForRepository:
          config.onCreateFavoriteGroupForRepository,
      }),
    },
  ]
}
