import { Account, IAccountIdentity } from '../models/account'
import { Repository } from '../models/repository'
import { lookupPreferredEmail } from './email'
import { getConfigValue, removeConfigValue, setConfigValue } from './git/config'
import { git } from './git/core'

export interface IManagedAuthor {
  readonly name: string
  readonly email: string
}

interface IManagedAccount {
  readonly identity: IAccountIdentity
  readonly name?: string
  readonly email?: string
  readonly profileName: string
  readonly profileEmail: string
}

interface IPreviousGitIdentity {
  readonly path: string
  readonly name: string | null
  readonly email: string | null
  readonly managedName: string
  readonly managedEmail: string
}

interface IAuthorshipSettings {
  readonly desktopManaged: boolean
  readonly externalManaged: boolean
  readonly accounts: ReadonlyArray<IManagedAccount>
  readonly previousGitIdentity: ReadonlyArray<IPreviousGitIdentity>
}

const key = 'desktop-authorship-settings'

const defaults: IAuthorshipSettings = {
  desktopManaged: false,
  externalManaged: false,
  accounts: [],
  previousGitIdentity: [],
}

export function getAuthorshipSettings(): IAuthorshipSettings {
  const value = localStorage.getItem(key)
  if (value === null) {
    return defaults
  }
  try {
    return { ...defaults, ...JSON.parse(value) }
  } catch (error) {
    throw new Error('Could not read Desktop authorship settings', {
      cause: error,
    })
  }
}

function save(settings: IAuthorshipSettings): void {
  localStorage.setItem(key, JSON.stringify(settings))
}

const sameAccount = (a: IAccountIdentity, b: IAccountIdentity) =>
  a.endpoint === b.endpoint && a.id === b.id

/** Refresh API-derived fields without overwriting individually edited fields. */
export function syncManagedAccounts(accounts: ReadonlyArray<Account>): void {
  const settings = getAuthorshipSettings()
  const updated = [...settings.accounts]
  for (const account of accounts) {
    const identity = { endpoint: account.endpoint, id: account.id }
    const index = updated.findIndex(item =>
      sameAccount(item.identity, identity)
    )
    const previous = updated[index]
    const item: IManagedAccount = {
      identity,
      name: previous?.name,
      email: previous?.email,
      profileName: account.friendlyName,
      profileEmail: lookupPreferredEmail(account),
    }
    if (index < 0) {
      updated.push(item)
    } else {
      updated[index] = item
    }
  }
  save({ ...settings, accounts: updated })
}

export function getManagedAuthor(
  identity: IAccountIdentity
): IManagedAuthor | null {
  const account = getAuthorshipSettings().accounts.find(item =>
    sameAccount(item.identity, identity)
  )
  return account === undefined
    ? null
    : {
        name: account.name ?? account.profileName,
        email: account.email ?? account.profileEmail,
      }
}

export function setManagedAuthorField(
  identity: IAccountIdentity,
  field: 'name' | 'email',
  value: string
): void {
  const settings = getAuthorshipSettings()
  save({
    ...settings,
    accounts: settings.accounts.map(account =>
      sameAccount(account.identity, identity)
        ? { ...account, [field]: value }
        : account
    ),
  })
}

export function getDesktopManagedAuthor(
  repository: Repository
): IManagedAuthor | null {
  const identity = repository.accountIdentity
  return getAuthorshipSettings().desktopManaged && identity != null
    ? getManagedAuthor(identity)
    : null
}

/** The existing local config is recorded once, before any external changes. */
export async function updateAuthorshipSettings(
  desktopManaged: boolean,
  externalManaged: boolean,
  repositories: ReadonlyArray<Repository>
): Promise<void> {
  const settings = getAuthorshipSettings()
  save({ ...settings, desktopManaged })
  await syncExternalAuthorship(repositories, desktopManaged && externalManaged)
}

/** Keep external Git identity in sync, restoring each original local value when disabled. */
let pendingExternalSync: Promise<void> = Promise.resolve()

export function syncExternalAuthorship(
  repositories: ReadonlyArray<Repository>,
  enabled?: boolean
): Promise<void> {
  const next = pendingExternalSync
    .catch(() => undefined)
    .then(() =>
      applyExternalAuthorship(
        repositories,
        enabled ?? getAuthorshipSettings().externalManaged
      )
    )
  pendingExternalSync = next
  return next
}

async function applyExternalAuthorship(
  repositories: ReadonlyArray<Repository>,
  enabled: boolean
): Promise<void> {
  let settings = getAuthorshipSettings()
  if (enabled) {
    for (const repository of repositories) {
      if (getDesktopManagedAuthor(repository) === null) {
        continue
      }
      const result = await git(
        ['worktree', 'list', '--porcelain'],
        repository.path,
        'checkExternalAuthorshipWorktrees'
      )
      if ((result.stdout.match(/^worktree /gm)?.length ?? 0) > 1) {
        throw new Error(
          `Cannot manage external Git identity for ${repository.path}: linked worktrees share local Git configuration`
        )
      }
    }
    for (const repository of repositories) {
      const author = getDesktopManagedAuthor(repository)
      if (author === null) {
        continue
      }
      if (
        !settings.previousGitIdentity.some(
          item => item.path === repository.path
        )
      ) {
        const previous: IPreviousGitIdentity = {
          path: repository.path,
          name: await getConfigValue(repository, 'user.name', true),
          email: await getConfigValue(repository, 'user.email', true),
          managedName: author.name,
          managedEmail: author.email,
        }
        settings = {
          ...settings,
          previousGitIdentity: [...settings.previousGitIdentity, previous],
        }
        save(settings)
      } else {
        const previous = settings.previousGitIdentity.find(
          item => item.path === repository.path
        )
        if (
          previous !== undefined &&
          ((await getConfigValue(repository, 'user.name', true)) !==
            previous.managedName ||
            (await getConfigValue(repository, 'user.email', true)) !==
              previous.managedEmail)
        ) {
          throw new Error(
            `Git identity for ${repository.path} changed outside Desktop; refusing to overwrite it`
          )
        }
      }
      await setConfigValue(repository, 'user.name', author.name)
      await setConfigValue(repository, 'user.email', author.email)
      settings = {
        ...settings,
        previousGitIdentity: settings.previousGitIdentity.map(item =>
          item.path === repository.path
            ? {
                ...item,
                managedName: author.name,
                managedEmail: author.email,
              }
            : item
        ),
      }
      save(settings)
    }
  }

  for (const previous of settings.previousGitIdentity) {
    if (
      enabled &&
      !repositories.some(repository => repository.path === previous.path)
    ) {
      continue
    }
    if (
      enabled &&
      repositories.some(
        repository =>
          repository.path === previous.path &&
          getDesktopManagedAuthor(repository) !== null
      )
    ) {
      continue
    }
    const repository = new Repository(previous.path, -1, null, false)
    if (
      (await getConfigValue(repository, 'user.name', true)) !==
        previous.managedName ||
      (await getConfigValue(repository, 'user.email', true)) !==
        previous.managedEmail
    ) {
      throw new Error(
        `Git identity for ${previous.path} changed outside Desktop; refusing to restore over it`
      )
    }
    for (const [field, value] of [
      ['user.name', previous.name],
      ['user.email', previous.email],
    ] as const) {
      if (value === null) {
        await removeConfigValue(repository, field)
      } else {
        await setConfigValue(repository, field, value)
      }
    }
    settings = {
      ...settings,
      previousGitIdentity: settings.previousGitIdentity.filter(
        item => item.path !== previous.path
      ),
    }
    save(settings)
  }
  save({ ...settings, externalManaged: enabled })
}
