import { Repository, getRepositoryAccountIdentity } from '../models/repository'
import { Account, isSameAccount } from '../models/account'
import {
  enableCommitMessageGeneration,
  enableCopilotConflictResolution,
  enableCopilotSdkCommitMessageGeneration,
} from './feature-flag'

/** Get the authenticated account for the repository. */
export function getAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  const identity = getRepositoryAccountIdentity(repository)
  return accounts.find(account => isSameAccount(account, identity)) ?? null
}

/**
 * Get the authenticated account to use for commit message generation.
 */
export function getAccountForCommitMessageGeneration(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | undefined {
  // Prefer the account that is associated to this repository.
  const repositoryAccount = getAccountForRepository(accounts, repository)
  if (
    repositoryAccount !== null &&
    enableCommitMessageGeneration(repositoryAccount)
  ) {
    return repositoryAccount
  }

  return accounts.find(enableCommitMessageGeneration)
}

/**
 * Predicate used to determine whether a given account is eligible to
 * use Copilot-powered conflict resolution. Combines the dev-only
 * feature-flag gate with the account's Copilot for Desktop capability,
 * which covers both "no Copilot subscription" and "disabled by org
 * policy".
 *
 * IMPORTANT: Do not remove the `isCopilotDesktopEnabled` check without
 * replacing it with the appropriate replacement.
 *
 * Also gated on `enableCopilotSdkCommitMessageGeneration`, which currently
 * controls whether we're allowed to use the Copilot SDK at all (beta/dev
 * builds). This keeps conflict resolution from running when the SDK is off.
 */
const isAccountEligibleForCopilotConflictResolution = (account: Account) =>
  enableCopilotConflictResolution() &&
  enableCopilotSdkCommitMessageGeneration(account) &&
  account.isCopilotDesktopEnabled === true

/**
 * Get the authenticated account to use for Copilot-powered merge conflict
 * resolution. Mirrors `getAccountForCommitMessageGeneration`.
 */
export function getAccountForCopilotConflictResolution(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | undefined {
  // Prefer the account that is associated to this repository.
  const repositoryAccount = getAccountForRepository(accounts, repository)
  if (
    repositoryAccount !== null &&
    isAccountEligibleForCopilotConflictResolution(repositoryAccount)
  ) {
    return repositoryAccount
  }

  return accounts.find(isAccountEligibleForCopilotConflictResolution)
}
