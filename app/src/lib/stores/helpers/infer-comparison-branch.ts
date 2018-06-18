import { Branch, IAheadBehind } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { Repository } from '../../../models/repository'
import { GitHubRepository } from '../../../models/github-repository'
import { revRange, getRemotes } from '../../git'

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
 * @param getAheadBehind function used to calculate the number of commits ahead/behind the current branch is from another branch
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
    return getTargetBranchOfPullRequest(branches, currentPullRequest)
  }

  const ghRepo = repository.gitHubRepository
  if (ghRepo !== null) {
    return ghRepo.fork === true && currentBranch !== null
      ? getDefaultBranchOfFork(
          branches,
          repository,
          ghRepo,
          currentBranch,
          getAheadBehind
        )
      : getDefaultBranchOfGitHubRepo(branches, ghRepo)
  }

  return getMasterBranch(branches)
}

function getMasterBranch(branches: ReadonlyArray<Branch>): Branch | null {
  return branches.find(b => b.name === 'master') || null
}

function getDefaultBranchOfGitHubRepo(
  branches: ReadonlyArray<Branch>,
  ghRepository: GitHubRepository
): Branch | null {
  return branches.find(b => b.name === ghRepository.defaultBranch) || null
}

function getTargetBranchOfPullRequest(
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
 */
async function getDefaultBranchOfFork(
  branches: ReadonlyArray<Branch>,
  repository: Repository,
  ghRepository: GitHubRepository,
  currentBranch: Branch,
  getAheadBehind: (
    repository: Repository,
    range: string
  ) => Promise<IAheadBehind | null>
): Promise<Branch | null> {
  const defaultBranch = getDefaultBranchOfGitHubRepo(branches, ghRepository)
  if (defaultBranch === null) {
    return getMasterBranch(branches)
  }

  const range = revRange(currentBranch.tip.sha, defaultBranch.tip.sha)
  const aheadBehind = await getAheadBehind(repository, range)
  if (aheadBehind !== null && aheadBehind.ahead > 0) {
    return defaultBranch
  }

  const parent = ghRepository.parent
  if (parent !== null && parent.defaultBranch !== null) {
    return getDefaultBranchOfForkedGitHubRepo(branches, repository)
  }

  return null
}

async function getDefaultBranchOfForkedGitHubRepo(
  branches: ReadonlyArray<Branch>,
  repository: Repository
): Promise<Branch | null> {
  const parentRepo = repository.gitHubRepository!.parent!
  const remotes = await getRemotes(repository)
  const remote = remotes.find(r => r.url === parentRepo.cloneURL)

  if (remote === undefined) {
    log.warn(`Could not find remote with URL ${parentRepo.cloneURL}.`)
    return null
  }

  const branch =
    branches.find(
      b => b.name === `${remote.name}/${parentRepo.defaultBranch}`
    ) || null

  return branch
}
