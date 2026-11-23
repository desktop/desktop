import { IAccountIdentity, isSameAccount } from '../models/account'
import {
  Repository,
  RepositoryWithGitHubRepository,
  getRepositoryAccountIdentity,
  isRepositoryWithGitHubRepository,
} from '../models/repository'

/** A change to a repository's account assignment. */
export interface IRepositoryAccountChange {
  readonly repository: Repository
  /** The login to assign, or null to clear the assignment. */
  readonly login: string | null
}

/**
 * Get the tracked GitHub repositories on the account's endpoint, sorted by
 * name. Repositories aren't filtered by whether the account can access them.
 */
export function getRepositoriesForAccountHost(
  repositories: ReadonlyArray<Repository>,
  account: IAccountIdentity
): ReadonlyArray<RepositoryWithGitHubRepository> {
  const endpoint = account.endpoint.toLowerCase()
  return repositories
    .filter(isRepositoryWithGitHubRepository)
    .filter(r => r.gitHubRepository.endpoint.toLowerCase() === endpoint)
    .sort(
      (x, y) =>
        x.name.localeCompare(y.name, undefined, { sensitivity: 'base' }) ||
        x.path.localeCompare(y.path)
    )
}

/**
 * Get the repositories selected when managing an account's repositories:
 * those without an assignment and those already assigned to the account.
 */
export function getInitialAccountRepositorySelection(
  repositories: ReadonlyArray<Repository>,
  account: IAccountIdentity
): ReadonlySet<number> {
  return new Set(
    repositories
      .filter(r => {
        const identity = getRepositoryAccountIdentity(r)
        return identity === null || isSameAccount(account, identity)
      })
      .map(r => r.id)
  )
}

/**
 * Get the assignment changes needed to assign the selected repositories to
 * the account.
 *
 * Selected repositories not already assigned to the account are assigned to
 * it. Unselected repositories assigned to the account have their assignment
 * cleared, and other unselected repositories keep their assignment.
 */
export function getAccountRepositoryChanges(
  repositories: ReadonlyArray<Repository>,
  account: IAccountIdentity,
  selected: ReadonlySet<number>
): ReadonlyArray<IRepositoryAccountChange> {
  const changes = new Array<IRepositoryAccountChange>()
  for (const repository of getRepositoriesForAccountHost(
    repositories,
    account
  )) {
    const assigned = isSameAccount(
      account,
      getRepositoryAccountIdentity(repository)
    )
    if (selected.has(repository.id) && !assigned) {
      changes.push({ repository, login: account.login })
    } else if (!selected.has(repository.id) && assigned) {
      changes.push({ repository, login: null })
    }
  }
  return changes
}

/**
 * Whether the account wasn't signed in before, as opposed to an existing
 * account signing in again to refresh its credentials.
 */
export function isPreviouslyUnknownAccount(
  previous: ReadonlyArray<IAccountIdentity>,
  account: IAccountIdentity
): boolean {
  return !previous.some(p => isSameAccount(p, account))
}
