import { Repository } from '../../models/repository'
import { IMenuItem } from '../../lib/menu-item'
import { Repositoryish } from './group-repositories'
import { writeClipboardText } from '../main-process-proxy'
import {
  RevealInFileManagerLabel,
  DefaultEditorLabel,
  DefaultShellLabel,
} from '../lib/context-menu'
import { Account } from '../../models/account'

interface IRepositoryListItemContextMenuConfig {
  repository: Repositoryish
  knownAccounts: ReadonlyArray<Account>
  accounts: ReadonlyArray<Account>
  onSelectedAccount: (account: Account) => void
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
  onCreateWorktree?: (repository: Repository) => void
  onShowWorktrees?: (repository: Repository) => void
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
    ...buildWorktreeMenuItems(config),
    ...buildAccountMenuItems(config),
    {
      label: __DARWIN__ ? 'Copy Repo Name' : 'Copy repo name',
      action: () => writeClipboardText(repository.name),
    },
    {
      label: __DARWIN__ ? 'Copy Repo Path' : 'Copy repo path',
      action: () => writeClipboardText(repository.path),
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

const buildAccountMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, knownAccounts, accounts, onSelectedAccount } = config
  if (!(repository instanceof Repository)) {
    return []
  }

  const endpoint =
    repository.gitHubRepository?.endpoint ??
    repository.accountIdentity?.endpoint
  if (endpoint === undefined) {
    return []
  }

  const retained = knownAccounts.filter(
    account => account.endpoint === endpoint
  )
  const signedIn = accounts.filter(account => account.endpoint === endpoint)
  if (retained.length < 2 || signedIn.length === 0) {
    return []
  }

  const submenu: ReadonlyArray<IMenuItem> = retained.flatMap(account => {
    const active = signedIn.some(
      candidate =>
        candidate.id === account.id && candidate.endpoint === account.endpoint
    )
    const current =
      repository.accountIdentity?.endpoint === account.endpoint &&
      repository.accountIdentity.id === account.id

    if (!active && !current) {
      return []
    }

    return [
      {
        label: active ? account.login : `${account.login} (Signed out)`,
        type: 'checkbox',
        checked: current,
        enabled: active,
        action: () => onSelectedAccount(account),
      },
    ]
  })

  return [{ label: 'Accounts', submenu }]
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

const buildWorktreeMenuItems = (
  config: IRepositoryListItemContextMenuConfig
): ReadonlyArray<IMenuItem> => {
  const { repository, onCreateWorktree, onShowWorktrees } = config

  if (!(repository instanceof Repository)) {
    return []
  }

  if (onCreateWorktree === undefined && onShowWorktrees === undefined) {
    return []
  }

  const items: Array<IMenuItem> = []

  if (onShowWorktrees !== undefined) {
    items.push({
      label: __DARWIN__ ? 'Show Worktrees' : 'Show worktrees',
      action: () => onShowWorktrees(repository),
    })
  }

  if (onCreateWorktree !== undefined) {
    items.push({
      label: __DARWIN__ ? 'New Worktree…' : 'New worktree…',
      action: () => onCreateWorktree(repository),
    })
  }

  return items
}
