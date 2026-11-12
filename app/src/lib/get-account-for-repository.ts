import { Repository, getRepositoryAccountIdentity } from '../models/repository'
import { Account, isSameAccount } from '../models/account'
import { enableCopilotAssistedCommit } from './feature-flag'

/** Get the authenticated account for the repository. */
export function getAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  const identity = getRepositoryAccountIdentity(repository)
  return accounts.find(account => isSameAccount(account, identity)) ?? null
}

/**
 * Get a Desktop-enabled account for Copilot, preferring the repository's account.
 *
 * Callers retain their feature-specific runtime and authorization checks.
 */
export function getAccountForCopilot(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | undefined {
  // Prefer the account that is associated to this repository.
  const repositoryAccount = getAccountForRepository(accounts, repository)
  if (
    repositoryAccount !== null &&
    repositoryAccount.isCopilotDesktopEnabled === true
  ) {
    return repositoryAccount
  }

  return accounts.find(account => account.isCopilotDesktopEnabled === true)
}

/**
 * Get a Desktop-enabled account for assisted commits when the feature is enabled.
 */
export function getAccountForCopilotAssistedCommits(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | undefined {
  return enableCopilotAssistedCommit()
    ? getAccountForCopilot(accounts, repository)
    : undefined
}
