import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { getAccountForEndpoint, getAccountByLogin } from './api'
import { repositoryAccountStore } from './stores/repository-account-store'

/**
 * Get the authenticated account for the repository.
 *
 * This function handles multi-account support by:
 * 1. Checking if the user has explicitly selected an account for this repository
 * 2. Falling back to the first available account for the repository's endpoint
 */
export function getAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  const gitHubRepository = repository.gitHubRepository
  if (!gitHubRepository) {
    return null
  }

  // Check if there's a preferred account for this repository
  const preferredLogin = repositoryAccountStore.getPreferredAccountLogin(repository)
  if (preferredLogin) {
    const preferred = getAccountByLogin(
      accounts,
      gitHubRepository.endpoint,
      preferredLogin
    )
    if (preferred) {
      return preferred
    }
  }

  // Fall back to first account on endpoint if no preference or preference not found
  return getAccountForEndpoint(accounts, gitHubRepository.endpoint)
}
