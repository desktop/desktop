import { Account } from '../models/account'
import { GitHubRepository } from '../models/github-repository'
import { getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

/** A local account selection. Tokens remain in the operating system's vault. */
export interface IRepositoryAccountBinding {
  readonly endpoint: string
  readonly id: number
  readonly login: string
}

/** Whether this build supports multiple accounts on the same GitHub host. */
export const supportsRepositoryAccounts = () => __RELEASE_CHANNEL__ === 'custom'

/** An explicit binding cannot be satisfied by the currently signed-in accounts. */
export class RepositoryAccountUnavailableError extends Error {
  public constructor(login: string) {
    super(
      `The repository is assigned to @${login}, which is not signed in. Sign in again or choose another account in Repository settings.`
    )
    this.name = 'RepositoryAccountUnavailableError'
  }
}

function repositoryKey(remoteURL: string): string | null {
  // Git LFS authenticates against a path below the repository URL.
  const remote = parseRemote(remoteURL.replace(/\/info\/lfs(?:\/.*)?$/, ''))
  return remote === null
    ? null
    : `repository-account:${JSON.stringify([
        remote.hostname.toLowerCase(),
        remote.owner.toLowerCase(),
        remote.name.toLowerCase(),
      ])}`
}

/** Read a binding shared by all local checkouts of the same remote repository. */
export function getRepositoryAccountBinding(
  remoteURL: string,
  storage: Pick<Storage, 'getItem'> = localStorage
): IRepositoryAccountBinding | null {
  if (!supportsRepositoryAccounts()) {
    return null
  }
  const key = repositoryKey(remoteURL)
  const raw = key === null ? null : storage.getItem(key)
  if (raw === null) {
    return null
  }
  const value: unknown = JSON.parse(raw)
  if (
    typeof value !== 'object' ||
    value === null ||
    !('endpoint' in value) ||
    typeof value.endpoint !== 'string' ||
    !('id' in value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    !('login' in value) ||
    typeof value.login !== 'string'
  ) {
    throw new Error(
      'The saved repository account is invalid. Choose an account in Repository settings.'
    )
  }
  return { endpoint: value.endpoint, id: value.id, login: value.login }
}

/** Get signed-in accounts belonging to the remote's host. */
export function getAccountsForRemote(
  accounts: ReadonlyArray<Account>,
  remoteURL: string
): ReadonlyArray<Account> {
  const remote = parseRemote(remoteURL.replace(/\/info\/lfs(?:\/.*)?$/, ''))
  if (remote === null) {
    return []
  }
  return accounts.filter(
    account =>
      new URL(getHTMLURL(account.endpoint)).host.toLowerCase() ===
        remote.hostname.toLowerCase() &&
      (!/^https?:\/\//i.test(remoteURL) ||
        new URL(getHTMLURL(account.endpoint)).origin ===
          new URL(remoteURL).origin)
  )
}

/** Resolve a repository's account, never substituting another for a binding. */
export function getAccountForRemote(
  accounts: ReadonlyArray<Account>,
  remoteURL: string
): Account | null {
  const candidates = getAccountsForRemote(accounts, remoteURL)
  const binding = getRepositoryAccountBinding(remoteURL)
  return binding === null
    ? candidates[0] ?? null
    : candidates.find(
        account =>
          account.endpoint === binding.endpoint &&
          account.id === binding.id &&
          account.token.length > 0
      ) ?? null
}

/** Resolve an API repository's account using the same binding as Git. */
export function getAccountForRepositoryDetails(
  accounts: ReadonlyArray<Account>,
  endpoint: string,
  owner: string,
  name: string
): Account | null {
  return getAccountForRemote(
    accounts,
    `${getHTMLURL(endpoint).replace(/\/$/, '')}/${owner}/${name}`
  )
}

/** Resolve the account for GitHub API operations on a repository. */
export function getAccountForGitHubRepository(
  accounts: ReadonlyArray<Account>,
  repository: GitHubRepository
): Account | null {
  return getAccountForRepositoryDetails(
    accounts,
    repository.endpoint,
    repository.owner.login,
    repository.name
  )
}

/** Save an explicit binding, or restore the host's default account selection. */
export function setRepositoryAccountBinding(
  remoteURL: string,
  account: Account | null,
  storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage
): void {
  const key = repositoryKey(remoteURL)
  if (!supportsRepositoryAccounts() || key === null) {
    throw new Error(
      'Account selection requires a GitHub repository remote in a Custom build.'
    )
  }
  if (account === null) {
    storage.removeItem(key)
    return
  }
  if (
    getAccountsForRemote([account], remoteURL).length === 0 ||
    !account.token
  ) {
    throw new Error(
      "Sign in to an account on this repository's GitHub host first."
    )
  }
  storage.setItem(
    key,
    JSON.stringify({
      endpoint: account.endpoint,
      id: account.id,
      login: account.login,
    })
  )
}

/** Enumerate saved selections without reading or exposing stored credentials. */
export function getRepositoryAccountBindings(): ReadonlyArray<{
  readonly remoteURL: string
  readonly binding: IRepositoryAccountBinding
}> {
  if (!supportsRepositoryAccounts()) {
    return []
  }
  const bindings = []
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index)
    if (key?.startsWith('repository-account:')) {
      const identity: unknown = JSON.parse(
        key.slice('repository-account:'.length)
      )
      if (
        !Array.isArray(identity) ||
        identity.length !== 3 ||
        !identity.every(part => typeof part === 'string')
      ) {
        throw new Error('Invalid repository account binding key.')
      }
      const remoteURL = `https://${identity[0]}/${identity[1]}/${identity[2]}`
      const binding = getRepositoryAccountBinding(remoteURL)
      if (binding !== null) {
        bindings.push({ remoteURL, binding })
      }
    }
  }
  return bindings
}

/** Only bound GitHub hosts need repository paths in Git credential requests. */
export function getRepositoryAccountCredentialOrigins(): ReadonlyArray<string> {
  return [
    ...new Set(
      getRepositoryAccountBindings().map(
        ({ binding }) => new URL(getHTMLURL(binding.endpoint)).origin
      )
    ),
  ]
}
