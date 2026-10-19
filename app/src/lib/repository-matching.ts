import * as URL from 'url'
import * as Path from 'path'

import { Account } from '../models/account'
import { IRemote } from '../models/remote'
import { API, getHTMLURL, IAPIFullRepository } from './api'
import { parseRemote, parseRepositoryIdentifier } from './remote-parsing'
import { caseInsensitiveEquals } from './compare'
import { GitHubRepository } from '../models/github-repository'
import {
  Repository,
  RepositoryWithGitHubRepository,
  assertIsRepositoryWithGitHubRepository,
} from '../models/repository'
import { Owner } from '../models/owner'

/** An account whose access to a remote has been verified by the API. */
export interface IAccessibleRepository extends IMatchedGitHubRepository {
  readonly apiRepository: IAPIFullRepository
}

/**
 * The account to assign to a freshly cloned repository.
 *
 * Includes the repository's API metadata when the account's access was
 * verified by probing. When the user picked the account in the clone dialog
 * there's nothing to verify, and the metadata is fetched on the next refresh.
 */
export type CloneAssignment = IAccessibleRepository | IMatchedGitHubRepository

/** Whether the assignment's access was verified and its metadata is known. */
export function isAccessibleRepository(
  assignment: CloneAssignment
): assignment is IAccessibleRepository {
  return 'apiRepository' in assignment
}

/**
 * Discover remote metadata using each matching account, without assigning one.
 *
 * Accounts that can't see the repository are left out. Any other failure to
 * check an account's access is thrown rather than treated as a lack of access.
 */
export async function probeRemoteRepositoryAccounts(
  accounts: ReadonlyArray<Account>,
  remote: string
): Promise<ReadonlyArray<IAccessibleRepository>> {
  const matches = await Promise.all(
    accounts.map(async account => {
      const match = matchGitHubRepository([account], remote)
      if (match === null) {
        return null
      }
      const apiRepository = await API.fromAccount(
        account
      ).fetchRepositoryIfAccessible(match.owner, match.name)
      return apiRepository === null ? null : { ...match, apiRepository }
    })
  )
  return matches.filter(
    (match): match is IAccessibleRepository => match !== null
  )
}

/**
 * Probe every signed-in account matching the remote, then choose among accounts
 * with access. Null means no account has access; undefined means canceled.
 */
export async function chooseAccountForRemoteRepository(
  accounts: ReadonlyArray<Account>,
  remote: string,
  path: string,
  choose: (
    repository: RepositoryWithGitHubRepository,
    accounts: ReadonlyArray<Account>
  ) => Promise<Account | undefined>
): Promise<IAccessibleRepository | null | undefined> {
  const accessible = await probeRemoteRepositoryAccounts(accounts, remote)
  if (accessible.length < 2) {
    return accessible[0] ?? null
  }

  const { name, owner, account } = accessible[0]
  const repository = new Repository(
    path,
    -1,
    new GitHubRepository(name, new Owner(owner, account.endpoint, -1), -1),
    false
  )
  assertIsRepositoryWithGitHubRepository(repository)
  const selected = await choose(
    repository,
    accessible.map(match => match.account)
  )
  if (selected === undefined) {
    return undefined
  }
  const match =
    accessible.find(
      match =>
        match.account.endpoint === selected.endpoint &&
        caseInsensitiveEquals(match.account.login, selected.login)
    ) ??
    // An account signed in from the chooser hasn't been checked yet.
    (await probeRemoteRepositoryAccounts([selected], remote)).at(0)
  if (match === undefined) {
    throw new Error(
      `The account @${selected.login} can't access ${owner}/${name}.`
    )
  }
  return match
}

export interface IMatchedGitHubRepository {
  /**
   * The name of the repository, e.g., for https://github.com/user/repo, the
   * name is `repo`.
   */
  readonly name: string

  /**
   * The login of the owner of the repository, e.g., for
   * https://github.com/user/repo, the owner is `user`.
   */
  readonly owner: string

  /** The account matching the repository remote */
  readonly account: Account
}

/** Try to use the list of users and a remote URL to guess a GitHub repository. */
export function matchGitHubRepository(
  accounts: ReadonlyArray<Account>,
  remote: string
): IMatchedGitHubRepository | null {
  for (const account of accounts) {
    const htmlURL = getHTMLURL(account.endpoint)
    const { hostname } = URL.parse(htmlURL)
    const parsedRemote = parseRemote(remote)

    if (parsedRemote !== null && hostname !== null) {
      if (parsedRemote.hostname.toLowerCase() === hostname.toLowerCase()) {
        return { name: parsedRemote.name, owner: parsedRemote.owner, account }
      }
    }
  }

  return null
}

/**
 * Create a match that isn't scoped to any account.
 *
 * Use this when a remote belongs to a GitHub host but no account was chosen,
 * so the GitHub repository record isn't tied to an arbitrary signed-in login.
 */
export function toAnonymousMatch(
  endpoint: string,
  owner: string,
  name: string
): IMatchedGitHubRepository {
  const account = new Account('', endpoint, '', [], '', -1, '')
  return { account, owner, name }
}

/**
 * Find an existing repository associated with this path
 *
 * @param repos The list of repositories tracked in the app
 * @param path The path on disk which might be a repository
 */
export function matchExistingRepository<T extends { readonly path: string }>(
  repos: ReadonlyArray<T>,
  path: string
): T | undefined {
  // Windows is guaranteed to be case-insensitive so we can be a bit less strict
  const normalize = __WIN32__
    ? (p: string) => Path.normalize(p).toLowerCase()
    : (p: string) => Path.normalize(p)

  const needle = normalize(path)
  return repos.find(r => normalize(r.path) === needle)
}

/**
 * Check whether or not a GitHub repository matches a given remote.
 *
 * @param gitHubRepository the repository containing information from the GitHub API
 * @param remote the remote details found in the Git repository
 */
export function repositoryMatchesRemote(
  gitHubRepository: GitHubRepository,
  remote: IRemote
): boolean {
  return (
    urlMatchesRemote(gitHubRepository.htmlURL, remote) ||
    urlMatchesRemote(gitHubRepository.cloneURL, remote)
  )
}

/**
 * Check whether or not a GitHub repository URL matches a given remote, by
 * parsing and comparing the structure of the each URL.
 *
 * @param url a URL associated with the GitHub repository
 * @param remote the remote details found in the Git repository
 */
export function urlMatchesRemote(url: string | null, remote: IRemote): boolean {
  if (url == null) {
    return false
  }

  const cloneUrl = parseRemote(url)
  const remoteUrl = parseRemote(remote.url)

  if (remoteUrl == null || cloneUrl == null) {
    return false
  }

  if (!caseInsensitiveEquals(remoteUrl.hostname, cloneUrl.hostname)) {
    return false
  }

  if (remoteUrl.owner == null || cloneUrl.owner == null) {
    return false
  }

  if (remoteUrl.name == null || cloneUrl.name == null) {
    return false
  }

  return (
    caseInsensitiveEquals(remoteUrl.owner, cloneUrl.owner) &&
    caseInsensitiveEquals(remoteUrl.name, cloneUrl.name)
  )
}

/**
 * Match a URL-like string to the Clone URL of a GitHub Repository
 *
 * @param url A remote-like URL to verify against the existing information
 * @param gitHubRepository GitHub API details for a repository
 */
export function urlMatchesCloneURL(
  url: string,
  gitHubRepository: GitHubRepository
): boolean {
  if (gitHubRepository.cloneURL === null) {
    return false
  }

  return urlsMatch(gitHubRepository.cloneURL, url)
}

export function urlsMatch(url1: string, url2: string) {
  const firstIdentifier = parseRepositoryIdentifier(url1)
  const secondIdentifier = parseRepositoryIdentifier(url2)

  return (
    firstIdentifier !== null &&
    secondIdentifier !== null &&
    firstIdentifier.hostname === secondIdentifier.hostname &&
    firstIdentifier.owner === secondIdentifier.owner &&
    firstIdentifier.name === secondIdentifier.name
  )
}
