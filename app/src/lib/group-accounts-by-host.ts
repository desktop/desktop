import { Account } from '../models/account'
import { getHTMLURL } from './api'

/**
 * Group accounts by the host of their web URL.
 *
 * Hosts are sorted alphabetically and accounts keep their relative order.
 */
export function groupAccountsByHost(
  accounts: ReadonlyArray<Account>
): ReadonlyArray<readonly [string, ReadonlyArray<Account>]> {
  const groups = new Map<string, Account[]>()
  for (const account of accounts) {
    const host = new URL(getHTMLURL(account.endpoint)).host
    const group = groups.get(host)
    if (group === undefined) {
      groups.set(host, [account])
    } else {
      group.push(account)
    }
  }
  return [...groups].sort(([x], [y]) => x.localeCompare(y))
}
