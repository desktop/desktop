import { Repository } from '../models/repository'
import { Account } from '../models/account'
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

  const identity = repository.accountIdentity
  if (identity === null) {
    return null
  }

  const matchingAccounts = accounts.filter(
    account => account.endpoint === gitHubRepository.endpoint
  )
  if (identity === undefined) {
    return matchingAccounts.length === 1 ? matchingAccounts[0] : null
  }

  return (
    matchingAccounts.find(
      account =>
        account.endpoint === identity.endpoint && account.id === identity.id
    ) ?? null
  )
}

/** Resolve a GitHub resource only if every tracked copy uses the same account. */
export function getAccountForGitHubRepository(
  accounts: ReadonlyArray<Account>,
  repositories: ReadonlyArray<Repository>,
  endpoint: string,
  owner: string,
  name: string
): Account | null {
  const matching = repositories.filter(
    repository =>
      repository.gitHubRepository?.endpoint === endpoint &&
      repository.gitHubRepository.owner.login.toLowerCase() ===
        owner.toLowerCase() &&
      repository.gitHubRepository.name.toLowerCase() === name.toLowerCase()
  )
  if (matching.length === 0) {
    const onHost = accounts.filter(account => account.endpoint === endpoint)
    return onHost.length === 1 ? onHost[0] : null
  }
  const resolved = matching.map(repository =>
    getAccountForRepository(accounts, repository)
  )
  const first = resolved[0]
  return first !== null && resolved.every(account => account === first)
    ? first
    : null
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

  return undefined
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

  return undefined
}
