import * as URL from 'url'

import { GitHubRepository } from '../models/github-repository'
import { Account } from '../models/account'
import { Owner } from '../models/owner'
import { getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

/** Try to use the list of users and a remote URL to guess a GitHub repository. */
export function matchGitHubRepository(
  accounts: ReadonlyArray<Account>,
  remote: string
): GitHubRepository | null {
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
): GitHubRepository | null {
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
    return new GitHubRepository(name, new Owner(owner, account.endpoint), null)
  }

  return null
}
