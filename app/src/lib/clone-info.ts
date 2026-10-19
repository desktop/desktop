import * as URL from 'url'
import { API, getHTMLURL, IAPIRepositoryCloneInfo } from './api'
import {
  GitProtocol,
  parseRemote,
  parseRepositoryIdentifier,
} from './remote-parsing'
import { findAccountForRemoteURL } from './find-account'
import { Account } from '../models/account'

/**
 * Look up the clone URL and default branch of a repository using the given
 * account. Resolves to null when the account can't see the repository.
 */
export type CloneInfoLookup = (
  account: Account,
  owner: string,
  name: string,
  protocol: GitProtocol | undefined
) => Promise<IAPIRepositoryCloneInfo | null>

const lookupCloneInfoUsingAPI: CloneInfoLookup = (
  account,
  owner,
  name,
  protocol
) => API.fromAccount(account).fetchRepositoryCloneInfo(owner, name, protocol)

function isAccountForHost(account: Account, hostname: string) {
  const accountHost = URL.parse(getHTMLURL(account.endpoint)).hostname
  return (
    accountHost !== null && accountHost.toLowerCase() === hostname.toLowerCase()
  )
}

/**
 * Resolve the URL and default branch to clone a URL or `owner/name` shortcut
 * entered in the URL tab of the clone dialog.
 *
 * For a full URL every signed-in account on the URL's host (followed by
 * anonymous access for GitHub.com) is tried in turn, and the URL's protocol is
 * preserved. When no account can see the repository an SSH URL is cloned as
 * entered, since the user's SSH configuration may still grant access, while an
 * HTTPS URL resolves to null.
 *
 * URLs for hosts without a signed-in account and unresolvable shortcuts are
 * cloned as entered.
 */
export async function resolveURLCloneInfo(
  url: string,
  accounts: ReadonlyArray<Account>,
  lookup: CloneInfoLookup = lookupCloneInfoUsingAPI
): Promise<IAPIRepositoryCloneInfo | null> {
  const fallback = { url }
  const remote = parseRemote(url)

  if (remote === null) {
    const identifier = parseRepositoryIdentifier(url)
    const account = await findAccountForRemoteURL(url, accounts)
    if (identifier === null || account === null) {
      return fallback
    }
    const { owner, name } = identifier
    return lookup(account, owner, name, undefined).catch(err => {
      log.error(`Failed to look up repository clone info for '${url}'`, err)
      return fallback
    })
  }

  const { hostname, owner, name, protocol } = remote
  const candidates = [...accounts, Account.anonymous()].filter(a =>
    isAccountForHost(a, hostname)
  )

  if (candidates.length === 0) {
    return fallback
  }

  for (const account of candidates) {
    try {
      const info = await lookup(account, owner, name, protocol)
      if (info !== null) {
        return info
      }
    } catch (err) {
      log.error(`Failed to look up repository clone info for '${url}'`, err)
      return fallback
    }
  }

  return protocol === 'ssh' ? fallback : null
}
