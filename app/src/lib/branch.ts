import { Branch } from '../models/branch'
import {
  isRepositoryWithGitHubRepository,
  Repository,
} from '../models/repository'
import { IBranchesState } from './app-state'

/**
 *
 * @param repository The repository to use.
 * @param branchesState The branches state of the repository.
 * @returns The default branch of the user's contribution target, or null if it's not known.
 *
 * This method will return the fork's upstream default branch, if the user
 * is contributing to the parent repository.
 *
 * Otherwise, this method will return the default branch of the passed in repository.
 */
export function findContributionTargetDefaultBranch(
  repository: Repository,
  { defaultBranch, upstreamDefaultBranch }: IBranchesState
): Branch | null {
  return isRepositoryWithGitHubRepository(repository)
    ? upstreamDefaultBranch ?? defaultBranch
    : defaultBranch
}
