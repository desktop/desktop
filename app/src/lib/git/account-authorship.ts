import { Account } from '../../models/account'
import { Repository } from '../../models/repository'
import { CommitIdentity } from '../../models/commit-identity'
import { lookupPreferredEmail } from '../email'
import { getAccountForRepository } from '../get-account-for-repository'
import { getConfigValue, removeConfigValue, setConfigValue } from './config'
import { getAuthorIdentity } from './var'

export interface IAuthor {
  readonly name: string
  readonly email: string
}

interface IStoredAuthor {
  readonly name?: string
  readonly email?: string
  readonly lastKnown?: IAuthor
}

interface IExternalAuthorSnapshot {
  readonly accountKey: string
  readonly previous: {
    readonly name: string | null
    readonly email: string | null
  }
  readonly written: IAuthor
}

const accountKey = (account: {
  readonly endpoint: string
  readonly id: number
}) => `${account.endpoint}:${account.id}`
const authorKey = (key: string) => `desktop-author:${key}`
const externalKey = (repository: Repository) =>
  `desktop-external-author:${repository.path}`

function readStoredAuthor(key: string): IStoredAuthor {
  const stored = localStorage.getItem(authorKey(key))
  if (stored === null) {
    return {}
  }

  try {
    return JSON.parse(stored)
  } catch (error) {
    log.error(`Failed parsing stored author data for ${key}`, error)
    return {}
  }
}

export function getAuthoringMode(): 'desktop' | 'git' {
  return localStorage.getItem('desktop-authoring-mode') === 'desktop'
    ? 'desktop'
    : 'git'
}

export function setAuthoringMode(mode: 'desktop' | 'git'): void {
  localStorage.setItem('desktop-authoring-mode', mode)
}

export function getManageExternalAppAuthors(): boolean {
  return localStorage.getItem('desktop-manage-external-authors') === 'true'
}

export function setManageExternalAppAuthors(enabled: boolean): void {
  localStorage.setItem('desktop-manage-external-authors', String(enabled))
}

export function getManagedAuthor(account: Account): IAuthor {
  const key = accountKey(account)
  const stored = readStoredAuthor(key)
  const author = {
    name: stored.name ?? account.friendlyName,
    email: stored.email ?? lookupPreferredEmail(account),
  }
  localStorage.setItem(
    authorKey(key),
    JSON.stringify({ ...stored, lastKnown: author })
  )
  return author
}

export function setManagedAuthor(account: Account, author: IAuthor): void {
  const key = accountKey(account)
  const stored = readStoredAuthor(key)
  localStorage.setItem(
    authorKey(key),
    JSON.stringify({
      name: author.name === stored.lastKnown?.name ? stored.name : author.name,
      email:
        author.email === stored.lastKnown?.email ? stored.email : author.email,
      lastKnown: author,
    })
  )
}

export function saveManagedAuthorEdits(
  account: Account,
  original: IAuthor,
  edited: IAuthor
): void {
  const current = getManagedAuthor(account)
  setManagedAuthor(account, {
    name: edited.name === original.name ? current.name : edited.name,
    email: edited.email === original.email ? current.email : edited.email,
  })
}

export async function getAuthorForRepository(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Promise<IAuthor | null> {
  if (getAuthoringMode() === 'desktop') {
    const account = getAccountForRepository(accounts, repository)
    if (account !== null) {
      return getManagedAuthor(account)
    }

    const identity = repository.accountIdentity
    if (identity !== undefined && identity !== null) {
      const stored = readStoredAuthor(accountKey(identity))
      if (stored.lastKnown !== undefined) {
        return stored.lastKnown
      }
    }
  }

  const author = await getAuthorIdentity(repository)
  return author === null ? null : { name: author.name, email: author.email }
}

export async function getCommitAuthorIdentityForRepository(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Promise<CommitIdentity | null> {
  const author = await getAuthorForRepository(repository, accounts)
  return author === null
    ? null
    : new CommitIdentity(author.name, author.email, new Date())
}

export async function synchronizeExternalAppAuthor(
  repository: Repository,
  accounts: ReadonlyArray<Account>
): Promise<void> {
  const key = externalKey(repository)
  const saved = localStorage.getItem(key)
  const snapshot: IExternalAuthorSnapshot | null =
    saved === null ? null : JSON.parse(saved)
  const identity = repository.accountIdentity
  const activeAccountKey =
    identity === undefined || identity === null ? null : accountKey(identity)
  const shouldManage =
    getAuthoringMode() === 'desktop' &&
    getManageExternalAppAuthors() &&
    activeAccountKey !== null &&
    (getAccountForRepository(accounts, repository) !== null ||
      readStoredAuthor(activeAccountKey).lastKnown !== undefined)

  if (
    snapshot !== null &&
    (!shouldManage || snapshot.accountKey !== activeAccountKey)
  ) {
    for (const field of ['name', 'email'] as const) {
      if (
        (await getConfigValue(repository, `user.${field}`, true)) ===
        snapshot.written[field]
      ) {
        const previous = snapshot.previous[field]
        if (previous === null) {
          await removeConfigValue(repository, `user.${field}`)
        } else {
          await setConfigValue(repository, `user.${field}`, previous)
        }
      }
    }
    localStorage.removeItem(key)
  }

  if (!shouldManage || activeAccountKey === null) {
    return
  }

  const author = await getAuthorForRepository(repository, accounts)
  if (author === null) {
    return
  }

  const previous =
    snapshot?.accountKey === activeAccountKey
      ? snapshot.previous
      : {
          name: await getConfigValue(repository, 'user.name', true),
          email: await getConfigValue(repository, 'user.email', true),
        }
  await setConfigValue(repository, 'user.name', author.name)
  await setConfigValue(repository, 'user.email', author.email)
  localStorage.setItem(
    key,
    JSON.stringify({ accountKey: activeAccountKey, previous, written: author })
  )
}
