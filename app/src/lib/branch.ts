import { Branch, BranchType } from '../models/branch'
import { UpstreamRemoteName } from './stores'
import {
  RepositoryWithGitHubRepository,
  getNonForkGitHubRepository,
} from '../models/repository'

/**
 * Finds the default branch of the upstream repository of the passed repository.
 *
 * When the passed repository is not a fork or the fork is configured to use itself
 * as the ForkContributionTarget, then this method will return null. Otherwise it'll
 * return the default branch of the upstream repository.
 *
 * @param repository The repository to use.
 * @param branches all the branches in the local repo.
 */
export function findDefaultUpstreamBranch(
  repository: RepositoryWithGitHubRepository,
  branches: ReadonlyArray<Branch>
): Branch | null {
  const githubRepository = getNonForkGitHubRepository(repository)

  // This is a bit hacky... we checked if the result of calling
  // getNonForkGitHubRepository() is the same as the associated
  // gitHubRepository. When this happens, we know that either the
  // repository is not a fork or that it's a fork with
  // ForkContributionTarget=Self.
  //
  // TODO: Make this method return the default branch of the
  // origin repository instead of null in this scenario.
  if (githubRepository === repository.gitHubRepository) {
    return null
  }

  const foundBranch = branches.find(
    b =>
      b.type === BranchType.Remote &&
      b.name === `${UpstreamRemoteName}/${githubRepository.defaultBranch}`
  )

  return foundBranch !== undefined ? foundBranch : null
}
