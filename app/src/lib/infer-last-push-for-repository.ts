import { GitStore } from './stores'
import { Repository } from '../models/repository'
import { Account } from '../models/account'
import { getAccountForRepository } from './get-account-for-repository'
import { API } from './api'
import { matchGitHubRepository } from './repository-matching'

/**
 * Use the GitHub API to find the last push date for a repository, favouring
 * the current remote (if defined) or falling back to the detected GitHub remote
 * if no tracking information set for the current branch.
 *
 * Returns null if no date can be detected.
 *
 * @param accounts available accounts in the app
 * @param gitStore Git information about the repository
 * @param repository the local repository tracked by Desktop
 */
export async function inferLastPushForRepository(
  accounts: ReadonlyArray<Account>,
  gitStore: GitStore,
  repository: Repository
): Promise<Date | null> {
  const account = getAccountForRepository(accounts, repository)
  if (account == null) {
    return null
  }

  await gitStore.loadRemotes()
  const { currentRemote } = gitStore

  const api = API.fromAccount(account)
  if (currentRemote !== null) {
    const matchedRepository = matchGitHubRepository(accounts, currentRemote.url)

    if (matchedRepository !== null) {
      const { owner, name } = matchedRepository
      const repo = await api.fetchRepository(owner, name)

      if (repo !== null) {
        return new Date(repo.pushed_at)
      }
    }
  }

  if (repository.gitHubRepository !== null) {
    const { owner, name } = repository.gitHubRepository
    const repo = await api.fetchRepository(owner.login, name)

    if (repo !== null) {
      return new Date(repo.pushed_at)
    }
  }

  return null
}
