import * as URL from 'url'
import { getHTMLURL, API, getDotComAPIEndpoint } from './api'
import { parseRemote, parseOwnerAndName } from './remote-parsing'
import { Account } from '../models/account'

/**
 * Find the user whose endpoint has a repository with the given owner and
 * name. This will prefer dot com over other endpoints.
 */
async function findRepositoryUser(users: ReadonlyArray<Account>, owner: string, name: string): Promise<Account | null> {
  const hasRepository = async (user: Account) => {
    const api = new API(user)
    try {
      const repository = await api.fetchRepository(owner, name)
      if (repository) {
        return true
      } else {
        return false
      }
    } catch (e) {
      return false
    }
  }

  // Prefer .com, then try all the others.
  const sortedUsers = Array.from(users).sort((u1, u2) => {
    if (u1.endpoint === getDotComAPIEndpoint()) {
      return -1
    } else if (u2.endpoint === getDotComAPIEndpoint()) {
      return 1
    } else {
      return 0
    }
  })

  for (const user of sortedUsers) {
    const has = await hasRepository(user)
    if (has) {
      return user
    }
  }

  return null
}

/**
 * Find the GitHub account associated with a given remote URL.
 *
 * @param url the remote URL to lookup
 * @param users the list of active GitHub and GitHub Enterprise accounts
 *
 * Will throw an error if the URL is not value or it is unable to resolve
 * the remote to an existing account
 */
export async function findUserForRemote(url: string, users: ReadonlyArray<Account>): Promise<Account> {

    // First try parsing it as a full URL. If that doesn't work, try parsing it
    // as an owner/name shortcut. And if that fails then throw our hands in the
    // air because we truly don't care.
    const parsedURL = parseRemote(url)
    if (parsedURL) {
      const dotComUser = users.find(u => {
        const htmlURL = getHTMLURL(u.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null

      if (dotComUser) {
        return dotComUser
      }
    }

    const parsedOwnerAndName = parseOwnerAndName(url)
    if (parsedOwnerAndName) {
      const owner = parsedOwnerAndName.owner
      const name = parsedOwnerAndName.name
      const user = await findRepositoryUser(users, owner, name)
      if (user) {
        return user
      }
      throw new Error(`Couldn't find a repository with that owner and name.`)
    }

    throw new Error(`Enter a URL or username/repository.`)
}
