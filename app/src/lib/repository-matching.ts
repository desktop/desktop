import * as URL from 'url'
import * as Path from 'path'

import { CloningRepository } from '../models/cloning-repository'
import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { IRemote } from '../models/remote'
import { getHTMLURL } from './api'
import { parseRemote, parseRepositoryIdentifier } from './remote-parsing'
import { caseInsensitiveEquals } from './compare'
import { GitHubRepository } from '../models/github-repository'

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

  /** The API endpoint. */
  readonly endpoint: string
}

/** Try to use the list of users and a remote URL to guess a GitHub repository. */
export function matchGitHubRepository(
  accounts: ReadonlyArray<Account>,
  remote: string
): IMatchedGitHubRepository | null {
  for (const account of accounts) {
    const match = matchRemoteWithAccount(account, remote)
    if (match) {
      return match
    }
  }

  return null
}

function matchRemoteWithAccount(
  account: Account,
  remote: string
): IMatchedGitHubRepository | null {
  const htmlURL = getHTMLURL(account.endpoint)
  const parsed = URL.parse(htmlURL)
  const host = parsed.hostname

  const parsedRemote = parseRemote(remote)
  if (!parsedRemote) {
    return null
  }

  const owner = parsedRemote.owner
  const name = parsedRemote.name

  if (
    host &&
    parsedRemote.hostname.toLowerCase() === host.toLowerCase() &&
    owner &&
    name
  ) {
    return { name, owner, endpoint: account.endpoint }
  }

  return null
}

/**
 * Find an existing repository associated with this path
 *
 * @param repositories The list of repositories tracked in the app
 * @param path The path on disk which might be a repository
 */
export function matchExistingRepository(
  repositories: ReadonlyArray<Repository | CloningRepository>,
  path: string
): Repository | CloningRepository | null {
  return (
    repositories.find(r => {
      if (__WIN32__) {
        // Windows is guaranteed to be case-insensitive so we can be a
        // bit more accepting.
        return (
          Path.normalize(r.path).toLowerCase() ===
          Path.normalize(path).toLowerCase()
        )
      } else {
        return Path.normalize(r.path) === Path.normalize(path)
      }
    }) || null
  )
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

  const firstIdentifier = parseRepositoryIdentifier(gitHubRepository.cloneURL)
  const secondIdentifier = parseRepositoryIdentifier(url)

  return (
    firstIdentifier !== null &&
    secondIdentifier !== null &&
    firstIdentifier.hostname === secondIdentifier.hostname &&
    firstIdentifier.owner === secondIdentifier.owner &&
    firstIdentifier.name === secondIdentifier.name
  )
}
