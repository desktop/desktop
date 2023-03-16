import * as URL from 'url'
import { getHTMLURL, API, getDotComAPIEndpoint } from './api'
import { parseRemote, parseRepositoryIdentifier } from './remote-parsing'
import { Account } from '../models/account'

type RepositoryLookupFunc = (
  account: Account,
  owner: string,
  name: string
) => Promise<boolean>

/**
 * Check if the repository designated by the owner and name exists and can be
 * accessed by the given account.
 */
async function canAccessRepositoryUsingAPI(
  account: Account,
  owner: string,
  name: string
): Promise<boolean> {
  const api = API.fromAccount(account)
  const repository = await api.fetchRepository(owner, name)
  if (repository) {
    return true
  } else {
    return false
  }
}

/**
 * Find the GitHub account associated with a given remote URL.
 *
 * @param urlOrRepositoryAlias - the URL or repository alias whose account
 *                               should be found
 * @param accounts             - the list of active GitHub and GitHub Enterprise
 *                               Server accounts
 */
export async function findAccountForRemoteURL(
  urlOrRepositoryAlias: string,
  accounts: ReadonlyArray<Account>,
  canAccessRepository: RepositoryLookupFunc = canAccessRepositoryUsingAPI
): Promise<Account | null> {
  const allAccounts = [...accounts, Account.anonymous()]

  // We have a couple of strategies to try to figure out what account we
  // should use to authenticate the URL:
  //
  //  1. Try to parse a remote out of the URL.
  //    1. If that works, try to find an account for that host.
  //    2. If we don't find an account move on to our next strategy.
  //  2. Try to parse an owner/name.
  //    1. If that works, find the first account that can access it.
  //  3. And if all that fails then throw our hands in the air because we
  //     truly don't care.
  const parsedURL = parseRemote(urlOrRepositoryAlias)
  if (parsedURL) {
    const account =
      allAccounts.find(a => {
        const htmlURL = getHTMLURL(a.endpoint)
        const parsedEndpoint = URL.parse(htmlURL)
        return parsedURL.hostname === parsedEndpoint.hostname
      }) || null

    // If we find an account whose hostname matches the URL to be cloned, it's
    // always gonna be our best bet for success. We're not gonna do better.
    if (account) {
      return account
    }
  }

  const repositoryIdentifier = parseRepositoryIdentifier(urlOrRepositoryAlias)
  if (repositoryIdentifier) {
    const { owner, name, hostname } = repositoryIdentifier

    // This chunk of code is designed to sort the user's accounts in this order:
    //  - authenticated GitHub account
    //  - GitHub Enterprise accounts
    //  - unauthenticated GitHub account (access public repositories)
    //
    // As this needs to be done efficiently, we consider endpoints not matching
    // `getDotComAPIEndpoint()` to be GitHub Enterprise accounts, and accounts
    // without a token to be unauthenticated.
    const sortedAccounts = Array.from(allAccounts).sort((a1, a2) => {
      if (a1.endpoint === getDotComAPIEndpoint()) {
        return a1.token.length ? -1 : 1
      } else if (a2.endpoint === getDotComAPIEndpoint()) {
        return a2.token.length ? 1 : -1
      } else {
        return 0
      }
    })

    for (const account of sortedAccounts) {
      if (hostname != null) {
        const htmlURL = URL.parse(getHTMLURL(account.endpoint))
        const accountHost = htmlURL.hostname
        if (accountHost !== hostname) {
          continue
        }
      }

      const canAccess = await canAccessRepository(account, owner, name)
      if (canAccess) {
        return account
      }
    }
  }

  return null
}
