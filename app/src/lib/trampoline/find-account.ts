import memoizeOne from 'memoize-one'
import { getHTMLURL } from '../api'
import { getGenericPassword, getGenericUsername } from '../generic-git-auth'
import { AccountsStore } from '../stores'
import { urlWithoutCredentials } from './url-without-credentials'
import { Account } from '../../models/account'
import { getAssignedAccountForRepoPath } from './trampoline-environment'

/**
 * When we're asked for credentials we're typically first asked for the username
 * immediately followed by the password. We memoize the getGenericPassword call
 * such that we only call it once per endpoint/login pair. Since we include the
 * trampoline token in the invalidation key we'll only call it once per
 * trampoline session.
 */
const memoizedGetGenericPassword = memoizeOne(
  (_trampolineToken: string, endpoint: string, login: string) =>
    getGenericPassword(endpoint, login)
)

/**
 * Find a GitHub account for the given remote URL.
 *
 * When multiple accounts share the same endpoint (e.g. multiple GitHub.com
 * accounts), returns the first matching account. The caller can later refine
 * using folder-based or explicit assignment if needed.
 */
export async function findGitHubTrampolineAccount(
  accountsStore: AccountsStore,
  remoteUrl: string
): Promise<Account | undefined> {
  const accounts = await accountsStore.getAll()
  const parsedUrl = new URL(remoteUrl)
  return accounts.find(
    a => new URL(getHTMLURL(a.endpoint)).origin === parsedUrl.origin
  )
}

/**
 * Find a GitHub account for the given remote URL, considering a specific
 * repository path for folder-based account assignment.
 *
 * When multiple accounts share the same endpoint, this function will prefer
 * the account whose login matches the parent folder (or grandparent folder)
 * of the repository.
 */
export async function findGitHubTrampolineAccountForRepo(
  accountsStore: AccountsStore,
  remoteUrl: string,
  repositoryPath?: string
): Promise<Account | undefined> {
  const accounts = await accountsStore.getAll()
  const parsedUrl = new URL(remoteUrl)

  const matchingAccounts = accounts.filter(
    a => new URL(getHTMLURL(a.endpoint)).origin === parsedUrl.origin
  )

  if (matchingAccounts.length === 0) {
    return undefined
  }

  if (matchingAccounts.length === 1) {
    return matchingAccounts[0]
  }

  // Multiple accounts for same endpoint — check explicit assignment first
  if (repositoryPath) {
    const assignedLogin = getAssignedAccountForRepoPath(repositoryPath)
    if (assignedLogin) {
      const assignedAccount = matchingAccounts.find(
        a => a.login.toLowerCase() === assignedLogin.toLowerCase()
      )
      if (assignedAccount) {
        return assignedAccount
      }
    }
  }

  if (!repositoryPath) {
    return matchingAccounts[0]
  }

  // Multiple accounts for same endpoint — try folder-based matching
  const Path = require('path')
  const parentDir = Path.basename(Path.dirname(repositoryPath))
  const grandparentDir = Path.basename(
    Path.dirname(Path.dirname(repositoryPath))
  )

  // Check parent directory first (GitHub/{login}/repo pattern)
  const folderMatch = matchingAccounts.find(
    a => a.login.toLowerCase() === parentDir.toLowerCase()
  )
  if (folderMatch) {
    return folderMatch
  }

  // Check grandparent directory (for deeper nesting)
  const grandparentMatch = matchingAccounts.find(
    a => a.login.toLowerCase() === grandparentDir.toLowerCase()
  )
  if (grandparentMatch) {
    return grandparentMatch
  }

  return matchingAccounts[0]
}

export async function findGenericTrampolineAccount(
  trampolineToken: string,
  remoteUrl: string
) {
  const parsedUrl = new URL(remoteUrl)
  const endpoint = urlWithoutCredentials(remoteUrl)

  const login =
    parsedUrl.username === ''
      ? getGenericUsername(endpoint)
      : parsedUrl.username

  if (!login) {
    return undefined
  }

  const token = await memoizedGetGenericPassword(
    trampolineToken,
    endpoint,
    login
  )

  if (!token) {
    // We have a username but no password, that warrants a warning
    log.warn(`credential: generic password for ${remoteUrl} missing`)
    return undefined
  }

  return { login, endpoint, token }
}
