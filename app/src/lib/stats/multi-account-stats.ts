import {
  Account,
  isDotComAccount,
  isEnterpriseAccount,
  isSameAccount,
} from '../../models/account'
import {
  Repository,
  getRepositoryAccountIdentity,
} from '../../models/repository'
import { CloneAssignment, matchGitHubRepository } from '../repository-matching'

/**
 * Installation-level multi-account snapshot sent with the daily usage stats.
 *
 * Contains only counts and a boolean; never logins, hosts or repositories.
 */
export interface IMultiAccountStats {
  /** The number of signed-in GitHub.com accounts */
  readonly dotComAccountCount: number

  /** The number of distinct endpoints with a signed-in enterprise account */
  readonly enterpriseHostCount: number

  /** The highest number of signed-in accounts on any single endpoint */
  readonly maxAccountsPerEndpoint: number

  /** Whether any endpoint has more than one signed-in account */
  readonly hasMultipleAccountsPerEndpoint: boolean

  /**
   * The number of endpoints where at least two signed-in accounts each have at
   * least one repository assigned to them
   */
  readonly multiAccountEndpointsInUseCount: number

  /** The number of repositories assigned to a signed-in account */
  readonly assignedRepositoryCount: number

  /** The number of GitHub repositories without an assigned account */
  readonly unassignedGitHubRepositoryCount: number

  /** The number of repositories assigned to an account that isn't signed in */
  readonly signedOutAssignmentRepositoryCount: number

  /**
   * The number of GitHub repositories on an endpoint with more than one
   * signed-in account
   */
  readonly repositoriesOnMultiAccountEndpointCount: number
}

/** Count signed-in accounts per endpoint. */
export function countAccountsByEndpoint(
  accounts: ReadonlyArray<Account>
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const { endpoint } of accounts) {
    counts.set(endpoint, (counts.get(endpoint) ?? 0) + 1)
  }
  return counts
}

/** Whether the endpoint has more than one signed-in account. */
export function isMultiAccountEndpoint(
  accounts: ReadonlyArray<Account>,
  endpoint: string
): boolean {
  return (countAccountsByEndpoint(accounts).get(endpoint) ?? 0) > 1
}

/**
 * Count accounts in `next` that weren't in `previous` and joined an endpoint
 * that already had a signed-in account. Credential refreshes keep the same
 * identity and aren't counted.
 */
export function countAdditionalAccountSignIns(
  previous: ReadonlyArray<Account>,
  next: ReadonlyArray<Account>
): number {
  return next.filter(
    account =>
      !previous.some(p => isSameAccount(p, account)) &&
      previous.some(p => p.endpoint === account.endpoint)
  ).length
}

/** Compute the multi-account snapshot from accounts and repositories. */
export function getMultiAccountStats(
  accounts: ReadonlyArray<Account>,
  repositories: ReadonlyArray<Repository>
): IMultiAccountStats {
  const accountsByEndpoint = countAccountsByEndpoint(accounts)
  const maxAccountsPerEndpoint = Math.max(0, ...accountsByEndpoint.values())
  const enterpriseHostCount = new Set(
    accounts.filter(isEnterpriseAccount).map(a => a.endpoint)
  ).size

  let assignedRepositoryCount = 0
  let unassignedGitHubRepositoryCount = 0
  let signedOutAssignmentRepositoryCount = 0
  let repositoriesOnMultiAccountEndpointCount = 0
  const accountsInUse = new Set<Account>()

  for (const repository of repositories) {
    const { gitHubRepository } = repository
    if (gitHubRepository === null) {
      continue
    }

    if ((accountsByEndpoint.get(gitHubRepository.endpoint) ?? 0) > 1) {
      repositoriesOnMultiAccountEndpointCount++
    }

    const identity = getRepositoryAccountIdentity(repository)
    if (identity === null) {
      unassignedGitHubRepositoryCount++
      continue
    }

    const account = accounts.find(a => isSameAccount(a, identity))
    if (account === undefined) {
      signedOutAssignmentRepositoryCount++
    } else {
      assignedRepositoryCount++
      accountsInUse.add(account)
    }
  }

  const accountsInUseByEndpoint = countAccountsByEndpoint([...accountsInUse])
  const multiAccountEndpointsInUseCount = [
    ...accountsInUseByEndpoint.values(),
  ].filter(count => count > 1).length

  return {
    dotComAccountCount: accounts.filter(isDotComAccount).length,
    enterpriseHostCount,
    maxAccountsPerEndpoint,
    hasMultipleAccountsPerEndpoint: maxAccountsPerEndpoint > 1,
    multiAccountEndpointsInUseCount,
    assignedRepositoryCount,
    unassignedGitHubRepositoryCount,
    signedOutAssignmentRepositoryCount,
    repositoriesOnMultiAccountEndpointCount,
  }
}

/** How an account was assigned when cloning or adding a repository. */
export type AssignmentOutcome = 'auto' | 'chosen' | 'unassigned'

/**
 * Classify the result of `chooseAccountForRemoteRepository` for stats.
 *
 * Returns null when the user cancelled, or when nothing was assigned and the
 * remote isn't on a signed-in GitHub endpoint.
 */
export function getAssignmentOutcome(
  assignment: CloneAssignment | null | undefined,
  chose: boolean,
  accounts: ReadonlyArray<Account>,
  remoteUrl: string
): AssignmentOutcome | null {
  if (assignment === undefined) {
    return null
  }
  if (assignment !== null) {
    return chose ? 'chosen' : 'auto'
  }
  return matchGitHubRepository(accounts, remoteUrl) !== null
    ? 'unassigned'
    : null
}

/**
 * The outcome of a credential request for a repository's GitHub account, or
 * of Git rejecting a GitHub account credential. Used only for usage stats.
 */
export type CredentialOutcome =
  | 'assigned-account'
  | 'after-prompt'
  | 'unavailable-in-background'
  | 'not-provided'
  | 'rejected'
