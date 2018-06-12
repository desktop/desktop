import { Branch, IAheadBehind } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { getAheadBehind, revRange } from '../../git'
import { Repository } from '../../../models/repository'
import { GitHubRepository } from '../../../models/github-repository'

/**
 * Infers which branch to use as the comparison branch
 *
 * @param branches The list of all branches for the repository
 * @param needsAName The object that determines how the branch will be inferred
 */
export async function inferComparisonBranch(
  branches: ReadonlyArray<Branch>,
  repository: Repository,
  currentPullRequest: PullRequest | null,
  currentBranch: Branch | null
): Promise<Branch | null> {
  if (currentPullRequest !== null) {
    return _getFeatureBranchOfPullRequest(branches, currentPullRequest)
  }

  const ghRepo = repository.gitHubRepository
  if (ghRepo !== null) {
    return ghRepo.fork && currentBranch !== null
      ? _getDefaultBranchOfFork(branches, repository, ghRepo, currentBranch)
      : _getDeafultBranchOfGithubRepo(branches, ghRepo)
  }

  return _getMasterBranch(branches)
}

/**
 * Do **not** call this method; use `inferComparisonBranch` instead
 *
 * Returns `master`, the default branch of a Git repository
 *
 * @param branches The list of all branches for the repository
 */
export function _getMasterBranch(
  branches: ReadonlyArray<Branch>
): Branch | null {
  return branches.find(b => b.name === 'master') || null
}

/**
 * Do **not** call this method; use `inferComparisonBranch` instead
 *
 * Returns the default branch of the GitHub repository
 *
 * @param branches The list of all branches for the repository
 * @param ghRepository The repository the branch belongs to
 */
export function _getDeafultBranchOfGithubRepo(
  branches: ReadonlyArray<Branch>,
  ghRepository: GitHubRepository
): Branch | null {
  return branches.find(b => b.name === ghRepository.defaultBranch) || null
}

/**
 * Do **not** call this method; use `inferComparisonBranch` instead
 *
 * Returns the base branch of the given pull request.
 *
 * @param branches The list of all branches for the repository
 * @param pr The pull request to use for finding the branch
 */
export function _getFeatureBranchOfPullRequest(
  branches: ReadonlyArray<Branch>,
  pr: PullRequest
): Branch | null {
  return branches.find(b => b.name === pr.base.ref) || null
}

/**
 * Do **not** call this method; use `inferComparisonBranch` instead
 *
 * Returns the default branch of the fork if it's ahead of `currentBranch`.
 * Otherwise, the default branch of the parent is returned.
 *
 * @param branches The list of all branches for the repository
 * @param repository The repository the branch belongs to
 * @param ghRepository
 * @param currentBranch The branch we want the parent of
 * @param getAheadBehind Callback function used to compute ahead/behind
 */
export async function _getDefaultBranchOfFork(
  branches: ReadonlyArray<Branch>,
  repository: Repository,
  ghRepository: GitHubRepository,
  currentBranch: Branch,
  mockingAheadBehind?: (range: string) => IAheadBehind
): Promise<Branch | null> {
  const defaultBranchName = ghRepository.defaultBranch

  if (defaultBranchName === null) {
    // Fall back to master
    return _getMasterBranch(branches)
  }

  const defaultBranch = _getDeafultBranchOfGithubRepo(branches, ghRepository)

  if (defaultBranch === null) {
    // Fall back to master
    return _getMasterBranch(branches)
  }

  const range = revRange(currentBranch.tip.sha, defaultBranch.tip.sha)

  // use the mock if it's passed - for testing only
  const aheadBehind =
    (mockingAheadBehind && mockingAheadBehind(range)) ||
    (await getAheadBehind(repository, range))

  // return default branch of fork if it has commits
  // the current branch does not have
  if (aheadBehind !== null && aheadBehind.ahead > 0) {
    return defaultBranch
  }

  // return the default branch of the parent repo
  const parent = ghRepository.parent
  if (parent !== null && parent.defaultBranch !== null) {
    return _getDeafultBranchOfGithubRepo(branches, parent)
  }

  return null
}
