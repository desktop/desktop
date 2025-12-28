import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { getAccountForEndpoint } from './api'
import { AccountsStore } from './stores/accounts-store'

/**
 * Get the authenticated account for the repository.
 * For GitHub.com repositories, prefers the currently active account.
 */
export function getAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository,
  accountsStore?: AccountsStore
): Account | null {
  const gitHubRepository = repository.gitHubRepository
  if (!gitHubRepository) {
    return null
  }

  // For GitHub.com repositories, prefer the active dotcom account
  if (gitHubRepository.endpoint === 'https://api.github.com' && accountsStore) {
    const activeAccount = accountsStore.getActiveDotComAccount()
    if (activeAccount) {
      return activeAccount
    }
  }

  return getAccountForEndpoint(accounts, gitHubRepository.endpoint)
}
