import * as URL from 'url'
import * as Path from 'path'

import { CloningRepository } from '../models/cloning-repository'
import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

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
