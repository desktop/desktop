import * as URL from 'url'

import { GitHubRepository } from '../models/github-repository'
import { User } from '../models/user'
import { Owner } from '../models/owner'
import { getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

/** Try to use the list of users and a remote URL to guess a GitHub repository. */
export function matchGitHubRepository(users: ReadonlyArray<User>, remote: string): GitHubRepository | null {
  for (const ix in users) {
    const match = matchRemoteWithUser(users[ix], remote)
    if (match) { return match }
  }

  return null
}

function matchRemoteWithUser(user: User, remote: string): GitHubRepository | null {
  const htmlURL = getHTMLURL(user.endpoint)
  const parsed = URL.parse(htmlURL)
  const host = parsed.hostname

  const parsedRemote = parseRemote(remote)
  if (!parsedRemote) { return null }

  const owner = parsedRemote.owner
  const name = parsedRemote.name
  if (parsedRemote.hostname === host && owner && name) {
    return new GitHubRepository(name, new Owner(owner, user.endpoint), null)
  }

  return null
}
