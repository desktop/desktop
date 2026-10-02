import { Account } from '../models/account'
import { matchGitHubRepository } from './repository-matching'

/**
 * Check access independently for each signed-in account on the remote's host.
 */
export async function findAccessibleRepositoryAccounts(
  accounts: ReadonlyArray<Account>,
  remoteURL: string,
  canAccess: (account: Account, owner: string, name: string) => Promise<boolean>
): Promise<ReadonlyArray<Account>> {
  const matches = accounts
    .map(account => matchGitHubRepository([account], remoteURL))
    .filter(match => match !== null)

  const accessible = await Promise.all(
    matches.map(async match => ({
      account: match.account,
      hasAccess: await canAccess(match.account, match.owner, match.name),
    }))
  )

  return accessible
    .filter(result => result.hasAccess)
    .map(result => result.account)
}
