import * as URL from 'url'

import GitHubRepository from '../models/github-repository'
import User from '../models/user'
import Owner from '../models/owner'
import {getHTMLURL} from './api'

/** Try to use the list of users and a remote URL to guess a GitHub repository .*/
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

  // Examples:
  // https://github.com/octocat/Hello-World.git
  // git@github.com:octocat/Hello-World.git
  // git:github.com/octocat/Hello-World.git
  const regexes = [
    new RegExp(`https://${host}/(.+)/(.+)(?:.git)`),
    new RegExp(`git@${host}:(.+)/(.+)(?:.git)`),
    new RegExp(`git:${host}/(.+)/(.+)(?:.git)`),
  ]

  for (let regex of regexes) {
    const result = remote.match(regex)
    if (!result) { continue }

    const login = result[1]
    const name = result[2]
    if (login && name) {
      const owner = new Owner(login, user.endpoint)
      return new GitHubRepository(name, owner)
    }
  }

  return null
}
