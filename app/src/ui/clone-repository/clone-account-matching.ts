import { Account } from '../../models/account'
import { API, getHTMLURL } from '../../lib/api'
import {
  parseRemote,
  parseRepositoryIdentifier,
} from '../../lib/remote-parsing'

/**
 * Find signed-in accounts which can read a clone URL. A shared host alone
 * cannot determine the account when several people are signed in there.
 */
export async function findCloneAccounts(
  url: string,
  accounts: ReadonlyArray<Account>,
  canAccess: (
    account: Account,
    owner: string,
    name: string
  ) => Promise<boolean> = async (account, owner, name) =>
    (await API.fromAccount(account).fetchRepository(owner, name)) !== null
): Promise<ReadonlyArray<Account>> {
  const identifier = parseRepositoryIdentifier(url)
  if (identifier === null) {
    return []
  }

  const remote = parseRemote(url)
  const candidates = accounts.filter(account => {
    if (remote === null) {
      return true
    }
    return new URL(getHTMLURL(account.endpoint)).hostname === remote.hostname
  })

  const accessible = await Promise.all(
    candidates.map(async account =>
      (await canAccess(account, identifier.owner, identifier.name))
        ? account
        : null
    )
  )
  return accessible.filter((account): account is Account => account !== null)
}
