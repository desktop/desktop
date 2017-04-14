import * as URL from 'url'
import { getHTMLURL, API, getDotComAPIEndpoint } from './api'
import { parseRemote, parseOwnerAndName } from './remote-parsing'
import { Account } from '../models/account'

/**
 * Check if the repository designated by the owner and name exists and can be
 * accessed by the given account.
 */
async function canAccessRepository(account: Account, owner: string, name: string): Promise<boolean> {
  const api = new API(account)
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

/**
 * Find the account whose endpoint has a repository with the given owner and
 * name. This will prefer dot com over other endpoints.
 */
async function findRepositoryAccount(accounts: ReadonlyArray<Account>, owner: string, name: string): Promise<Account | null> {
  // Prefer an authenticated dot com account, then Enterprise accounts, and
  // finally the unauthenticated dot com account.
  const sortedAccounts = Array.from(accounts).sort((a1, a2) => {
    if (a1.endpoint === getDotComAPIEndpoint()) {
      if (a1.token.length) {
        return -1
      } else {
        return 1
      }
    } else if (a2.endpoint === getDotComAPIEndpoint()) {
      if (a2.token.length) {
        return 1
      } else {
        return -1
      }
    } else {
      return 0
    }
  })

  for (const account of sortedAccounts) {
    const canAccess = await canAccessRepository(account, owner, name)
    if (canAccess) {
      return account
    }
  }

  return null
}

/**
 * Find the GitHub account associated with a given remote URL.
 *
 * @param url      - the remote URL to lookup
 * @param accounts - the list of active GitHub and GitHub Enterprise accounts
 */
export async function findAccountForRemote(url: string, accounts: ReadonlyArray<Account>): Promise<Account | null> {
    const allAccounts = [ ...accounts, Account.anonymous() ]

    // First try parsing it as a full URL. If that doesn't work, try parsing it
    // as an owner/name shortcut. And if that fails then throw our hands in the
    // air because we truly don't care.
    const parsedURL = parseRemote(url)
    if (parsedURL) {
      const account = allAccounts.find(a => {
        const htmlURL = getHTMLURL(a.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null

      if (account) {
        const owner = parsedURL.owner
        const name = parsedURL.name
        if (owner && name) {
          const canAccess = await canAccessRepository(account, owner, name)
          if (canAccess) {
            return account
          }
        } else {
          return account
        }
      }
    }

    const parsedOwnerAndName = parseOwnerAndName(url)
    if (parsedOwnerAndName) {
      const owner = parsedOwnerAndName.owner
      const name = parsedOwnerAndName.name
      const account = await findRepositoryAccount(allAccounts, owner, name)
      if (account) {
        return account
      }
    }

    return null
}
