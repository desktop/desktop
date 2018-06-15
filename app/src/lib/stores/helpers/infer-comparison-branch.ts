import { Branch, IAheadBehind } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { Repository } from '../../../models/repository'
import { GitHubRepository } from '../../../models/github-repository'
import { revRange } from '../../git'

/**
 * Infers which branch to use as the comparison branch
 *
 * The branch returned is determined by the following conditions:
 * 1. Given a pull request -> target branch of PR
 * 2. Given a forked repository -> default branch on `upstream`
 * 3. Given a hosted repository -> default branch on `origin`
 * 4. Fallback -> `master` branch
 *
 * @param branches The list of all branches for the repository
 * @param repository The repository the branch belongs to
 * @param currentPullRequest The pull request to use for finding the branch
 * @param currentBranch The branch we want the parent of
 * @param getAheadBehind function used to calculate ahead/behind
 */
export async function inferComparisonBranch(
  branches: ReadonlyArray<Branch>,
  repository: Repository,
  currentPullRequest: PullRequest | null,
  currentBranch: Branch | null,
  getAheadBehind: (
    repository: Repository,
    range: string
  ) => Promise<IAheadBehind | null>
): Promise<Branch | null> {
  if (currentPullRequest !== null) {
    return _getTargetBranchOfPullRequest(branches, currentPullRequest)
  }

  const ghRepo = repository.gitHubRepository
  if (ghRepo !== null) {
    return ghRepo.fork === true && currentBranch !== null
      ? _getDefaultBranchOfFork(
          branches,
          repository,
          ghRepo,
          currentBranch,
          getAheadBehind
        )
      : _getDefaultBranchOfGitHubRepo(branches, ghRepo)
  }

  return _getMasterBranch(branches)
}

/**
 * For `inferComparisonBranch` case where inferring for local branches
 *
 * Returns `master`, the default branch of a Git repository
 *
 * @param branches The list of all branches for the repository
 */
function _getMasterBranch(branches: ReadonlyArray<Branch>): Branch | null {
  return branches.find(b => b.name === 'master') || null
}

/**
 * For `inferComparisonBranch` case where inferring for a repository
 * hosted on GitHub, but with no forks
 *
 * Returns the default branch of the GitHub repository
 *
 * @param branches The list of all branches for the repository
 * @param ghRepository The repository the branch belongs to
 */
function _getDefaultBranchOfGitHubRepo(
  branches: ReadonlyArray<Branch>,
  ghRepository: GitHubRepository
): Branch | null {
  return branches.find(b => b.name === ghRepository.defaultBranch) || null
}

/**
 * For `inferComparisonBranch` case where inferring for a pull request
 *
 * Returns the base branch of the given pull request.
 *
 * @param branches The list of all branches for the repository
 * @param pr The pull request to use for finding the branch
 */
function _getTargetBranchOfPullRequest(
  branches: ReadonlyArray<Branch>,
  pr: PullRequest
): Branch | null {
  return branches.find(b => b.name === pr.base.ref) || null
}

/**
 * For `inferComparisonBranch` case where inferring for a forked repository
 *
 * Returns the default branch of the fork if it's ahead of `currentBranch`.
 * Otherwise, the default branch of the parent is returned.
 *
 * @param branches The list of all branches for the repository
 * @param repository The repository the branch belongs to
 * @param ghRepository The github specific information for the repository
 * @param currentBranch The branch we want the parent of
 * @param getAheadBehind function used to calculate ahead/behind
 */
async function _getDefaultBranchOfFork(
  branches: ReadonlyArray<Branch>,
  repository: Repository,
  ghRepository: GitHubRepository,
  currentBranch: Branch,
  getAheadBehind: (
    repository: Repository,
    range: string
  ) => Promise<IAheadBehind | null>
): Promise<Branch | null> {
  const defaultBranch = _getDefaultBranchOfGitHubRepo(branches, ghRepository)

  if (defaultBranch === null) {
    return _getMasterBranch(branches)
  }

  const range = revRange(currentBranch.tip.sha, defaultBranch.tip.sha)
  const aheadBehind = await getAheadBehind(repository, range)

  // return default branch of fork if it has commits
  // the current branch does not have
  if (aheadBehind !== null && aheadBehind.ahead > 0) {
    return defaultBranch
  }

  // return the default branch of the parent repo
  const parent = ghRepository.parent
  if (parent !== null && parent.defaultBranch !== null) {
    return _getDefaultBranchOfGitHubRepo(branches, parent)
  }

  return null
}
