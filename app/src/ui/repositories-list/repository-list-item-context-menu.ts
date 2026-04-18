import { Repository } from '../../models/repository'
import { IMenuItem } from '../../lib/menu-item'
import { Repositoryish } from './group-repositories'
import { clipboard } from 'electron'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
  DefaultShellLabel,
} from '../lib/context-menu'
import { IRepositoryFolder } from './repository-folder-store'

interface IRepositoryListItemContextMenuConfig {
  repository: Repositoryish
  shellLabel: string | undefined
  externalEditorLabel: string | undefined
  askForConfirmationOnRemoveRepository: boolean
  onViewOnGitHub: (repository: Repositoryish) => void
  onOpenInShell: (repository: Repositoryish) => void
  onShowRepository: (repository: Repositoryish) => void
  onOpenInExternalEditor: (repository: Repositoryish) => void
  onRemoveRepository: (repository: Repositoryish) => void
  onChangeRepositoryAlias: (repository: Repository) => void
  onRemoveRepositoryAlias: (repository: Repository) => void
  repositoryFolders?: ReadonlyArray<IRepositoryFolder>
  currentFolderId?: string | null
  onAssignRepositoryToFolder?: (
    repository: Repository,
    folderId: string | null
  ) => void
  onCreateRepositoryFolder?: (repository: Repository | null) => void
  onManageRepositoryFolders?: () => void
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
    ...buildFolderMenuItems(config),
    ...buildAliasMenuItems(config),
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

const buildFolderMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository } = config

  if (
    !(repository instanceof Repository) ||
    config.onAssignRepositoryToFolder === undefined ||
    config.onCreateRepositoryFolder === undefined ||
    config.onManageRepositoryFolders === undefined
  ) {
    return []
  }

  const folderItems: Array<IMenuItem> = [
    {
      label: __DARWIN__ ? 'No Folder' : 'No folder',
      type: 'checkbox',
      checked: config.currentFolderId === null,
      action: () => config.onAssignRepositoryToFolder?.(repository, null),
    },
  ]

  for (const folder of config.repositoryFolders ?? []) {
    folderItems.push({
      label: folder.name,
      type: 'checkbox',
      checked: config.currentFolderId === folder.id,
      action: () => config.onAssignRepositoryToFolder?.(repository, folder.id),
    })
  }

  folderItems.push(
    { type: 'separator' },
    {
      label: __DARWIN__ ? 'New Folder…' : 'New folder…',
      action: () => config.onCreateRepositoryFolder?.(repository),
    },
    {
      label: __DARWIN__
        ? 'Manage Repository Folders…'
        : 'Manage repository folders…',
      action: () => config.onManageRepositoryFolders?.(),
    },
    { type: 'separator' }
  )

  return [
    {
      label: __DARWIN__ ? 'Move to Folder' : 'Move to folder',
      submenu: folderItems,
    },
  ]
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
