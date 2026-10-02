import { Account } from '../models/account'
import { Repository } from '../models/repository'
import { getRemotes } from './git/remote'
import { matchGitHubRepository } from './repository-matching'
import { findDefaultRemote } from './stores/helpers/find-default-remote'

/** Match repositories whose GitHub metadata has not yet been fetched using local remotes. */
export async function repositoryIsOnAccountHost(
  repository: Repository,
  account: Account
): Promise<boolean> {
  if (repository.gitHubRepository !== null) {
    return repository.gitHubRepository.endpoint === account.endpoint
  }

  const remotes = await getRemotes(repository)
  const primaryRemote = findDefaultRemote(remotes)
  return (
    primaryRemote !== null &&
    matchGitHubRepository([account], primaryRemote.url) !== null
  )
}
