import * as URL from 'url'
import { getHTMLURL, API, getDotComAPIEndpoint } from './api'
import { parseRemote, parseOwnerAndName } from './remote-parsing'
import { Account } from '../models/account'

/**
 * Find the account whose endpoint has a repository with the given owner and
 * name. This will prefer dot com over other endpoints.
 */
async function findRepositoryAccount(accounts: ReadonlyArray<Account>, owner: string, name: string): Promise<Account | null> {
  const hasRepository = async (account: Account) => {
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

  // Prefer .com, then try all the others.
  const sortedAccounts = Array.from(accounts).sort((a1, a2) => {
    if (a1.endpoint === getDotComAPIEndpoint()) {
      return -1
    } else if (a2.endpoint === getDotComAPIEndpoint()) {
      return 1
    } else {
      return 0
    }
  })

  for (const account of sortedAccounts) {
    const has = await hasRepository(account)
    if (has) {
      return account
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
export async function findAccountForRemote(url: string, accounts: ReadonlyArray<Account>): Promise<Account> {

    // First try parsing it as a full URL. If that doesn't work, try parsing it
    // as an owner/name shortcut. And if that fails then throw our hands in the
    // air because we truly don't care.
    const parsedURL = parseRemote(url)
    if (parsedURL) {
      const dotComAccount = accounts.find(a => {
        const htmlURL = getHTMLURL(a.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null

      if (dotComAccount) {
        return dotComAccount
      }
    }

    const parsedOwnerAndName = parseOwnerAndName(url)
    if (parsedOwnerAndName) {
      const owner = parsedOwnerAndName.owner
      const name = parsedOwnerAndName.name
      const account = await findRepositoryAccount(accounts, owner, name)
      if (account) {
        return account
      }

      // as a fallback, let's test that this is a public GitHub repository
      // because we are still allowed to clone this repository
      const accountWithoutToken = Account.anonymous()
      const api = new API(accountWithoutToken)
      const repo = await api.fetchRepository(owner, name)
      if (repo) {
        return accountWithoutToken
      }

      throw new Error(`Couldn't find a repository with that owner and name.`)
    }

    throw new Error(`Enter a URL or username/repository.`)
}
