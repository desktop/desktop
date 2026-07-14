import * as Path from 'path'
import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { getAccountForEndpoint, getAccountsForEndpoint } from './api'
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
  const gitHubRepository = repository.gitHubRepository
  if (!gitHubRepository) {
    return null
  }

  return getAccountForEndpoint(accounts, gitHubRepository.endpoint)
}

/**
 * Get the assigned account login for a repository, if one has been set.
 *
 * The assignment is stored in the repository's `assignedAccountLogin` field.
 */
export function getAssignedAccountLogin(
  repository: Repository
): string | null {
  return repository.assignedAccountLogin
}

/**
 * Detect which account owns a repository based on folder structure.
 *
 * Convention: repositories live under `GitHub/{account-login}/repo-name`.
 * The parent folder name is matched against account logins (case-insensitive).
 */
export function detectAccountFromFolder(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  const repoPath = repository.path
  // Expected pattern: .../GitHub/{login}/{repo-name}
  // We look at the grandparent directory name
  const parentDir = Path.basename(Path.dirname(repoPath))
  const grandparentDir = Path.basename(
    Path.dirname(Path.dirname(repoPath))
  )

  // Check if parent matches an account login (for repos at GitHub/{login}/repo)
  const parentMatch = accounts.find(
    a => a.login.toLowerCase() === parentDir.toLowerCase()
  )
  if (parentMatch) {
    return parentMatch
  }

  // Check if grandparent matches (for repos nested deeper)
  const grandparentMatch = accounts.find(
    a => a.login.toLowerCase() === grandparentDir.toLowerCase()
  )
  if (grandparentMatch) {
    return grandparentMatch
  }

  return null
}

/**
 * Smart account resolution for a repository.
 *
 * Resolution order:
 * 1. Explicit per-repo account assignment (stored in DB)
 * 2. Folder-based detection (GitHub/{login}/repo pattern)
 * 3. Endpoint-based matching (first account for the endpoint)
 */
export function getAccountForRepositorySmart(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  // 1. Check explicit assignment
  const assignedLogin = getAssignedAccountLogin(repository)
  if (assignedLogin) {
    const assigned = accounts.find(
      a => a.login.toLowerCase() === assignedLogin.toLowerCase()
    )
    if (assigned) {
      return assigned
    }
  }

  // 2. Folder-based detection
  const folderMatch = detectAccountFromFolder(accounts, repository)
  if (folderMatch) {
    return folderMatch
  }

  // 3. Fall back to endpoint-based matching
  return getAccountForRepository(accounts, repository)
}

/**
 * Get the best account for a repository when multiple accounts share the
 * same endpoint. Uses smart resolution.
 */
export function getBestAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  const gitHubRepository = repository.gitHubRepository
  if (!gitHubRepository) {
    return null
  }

  const endpointAccounts = getAccountsForEndpoint(
    accounts,
    gitHubRepository.endpoint
  )

  if (endpointAccounts.length <= 1) {
    // Single account or no accounts for this endpoint — simple case
    return endpointAccounts[0] ?? null
  }

  // Multiple accounts share this endpoint — use smart resolution
  return getAccountForRepositorySmart(accounts, repository)
}

/**
 * Get the authenticated account to use for commit message generation.
 */
export function getAccountForCommitMessageGeneration(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | undefined {
  // Prefer the account that is associated to this repository (smart resolution).
  const repositoryAccount = getBestAccountForRepository(accounts, repository)
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
  // Prefer the account that is associated to this repository (smart resolution).
  const repositoryAccount = getBestAccountForRepository(accounts, repository)
  if (
    repositoryAccount !== null &&
    isAccountEligibleForCopilotConflictResolution(repositoryAccount)
  ) {
    return repositoryAccount
  }

  return accounts.find(isAccountEligibleForCopilotConflictResolution)
}
