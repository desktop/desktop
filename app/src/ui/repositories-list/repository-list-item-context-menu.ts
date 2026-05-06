import { Repository } from '../../models/repository'
import { FavouriteGroup } from '../../models/favourite-group'
import { IMenuItem } from '../../lib/menu-item'
import { Repositoryish } from './group-repositories'
import { clipboard } from 'electron'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
  DefaultShellLabel,
} from '../lib/context-menu'

interface IRepositoryListItemContextMenuConfig {
  repository: Repositoryish
  shellLabel: string | undefined
  externalEditorLabel: string | undefined
  askForConfirmationOnRemoveRepository: boolean
  favouriteGroups: ReadonlyArray<FavouriteGroup>
  onViewOnGitHub: (repository: Repositoryish) => void
  onOpenInShell: (repository: Repositoryish) => void
  onShowRepository: (repository: Repositoryish) => void
  onOpenInExternalEditor: (repository: Repositoryish) => void
  onRemoveRepository: (repository: Repositoryish) => void
  onChangeRepositoryAlias: (repository: Repository) => void
  onRemoveRepositoryAlias: (repository: Repository) => void
  onSetRepositoryFavouriteGroup: (
    repository: Repository,
    favouriteGroupId: number | null
  ) => void
  onCreateFavouriteGroupForRepository: (repository: Repository) => void
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
    ...buildFavouriteMenuItems(config),
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

const buildFavouriteMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, favouriteGroups } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  const newGroupLabel = __DARWIN__ ? 'New Group…' : 'New group…'

  if (repository.isFavourite) {
    const items: Array<IMenuItem> = []
    if (favouriteGroups.length > 0) {
      const moveSubmenu: Array<IMenuItem> = favouriteGroups.map(g => ({
        label: g.name,
        type: 'checkbox',
        checked: g.id === repository.favouriteGroupId,
        action: () => config.onSetRepositoryFavouriteGroup(repository, g.id),
      }))
      moveSubmenu.push({ type: 'separator' })
      moveSubmenu.push({
        label: newGroupLabel,
        action: () => config.onCreateFavouriteGroupForRepository(repository),
      })
      items.push({
        label: __DARWIN__ ? 'Move to Group' : 'Move to group',
        submenu: moveSubmenu,
      })
    }
    items.push({
      label: __DARWIN__ ? 'Remove from Favourites' : 'Remove from favourites',
      action: () => config.onSetRepositoryFavouriteGroup(repository, null),
    })
    return items
  }

  if (favouriteGroups.length === 0) {
    return [
      {
        label: __DARWIN__ ? 'Add to Favourites…' : 'Add to favourites…',
        action: () => config.onCreateFavouriteGroupForRepository(repository),
      },
    ]
  }

  const submenu: Array<IMenuItem> = favouriteGroups.map(g => ({
    label: g.name,
    action: () => config.onSetRepositoryFavouriteGroup(repository, g.id),
  }))
  submenu.push({ type: 'separator' })
  submenu.push({
    label: newGroupLabel,
    action: () => config.onCreateFavouriteGroupForRepository(repository),
  })

  return [
    {
      label: __DARWIN__ ? 'Add to Favourites' : 'Add to favourites',
      submenu,
    },
  ]
}
