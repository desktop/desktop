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
  const repository = await api.fetchRepository(owner, name)
  if (repository) {
    return true
  } else {
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
      return a1.token.length ? -1 : 1
    } else if (a2.endpoint === getDotComAPIEndpoint()) {
      return a2.token.length ? 1 : -1
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
 * @param urlOrRepositoryAlias - the URL or repository alias whose account
 *                               should be found
 * @param accounts             - the list of active GitHub and GitHub Enterprise
 *                               accounts
 */
export async function findAccountForRemote(urlOrRepositoryAlias: string, accounts: ReadonlyArray<Account>): Promise<Account | null> {
    const allAccounts = [ ...accounts, Account.anonymous() ]

    // We have a couple of strategies to try to figure out what account we
    // should use to authenticate the URL:
    //
    //  1. Try to parse a remote out of the URL.
    //    1. If that works, try to find an account for that host.
    //      1. If we find account, check if we can access that repository.
    //    2. If we don't find an account or we can't access the repository, move
    //       on to our next strategy.
    //  2. Try to parse an owner/name.
    //    1. If that works, find the first account that can access it.
    //  3. And if all that fails then throw our hands in the air because we
    //     truly don't care.
    const parsedURL = parseRemote(urlOrRepositoryAlias)
    if (parsedURL) {
      const account = allAccounts.find(a => {
        const htmlURL = getHTMLURL(a.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null

      if (account) {
        const { owner, name } = parsedURL
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

    const parsedOwnerAndName = parseOwnerAndName(urlOrRepositoryAlias)
    if (parsedOwnerAndName) {
      const { owner, name } = parsedOwnerAndName
      const account = await findRepositoryAccount(allAccounts, owner, name)
      if (account) {
        return account
      }
    }

    return null
}
