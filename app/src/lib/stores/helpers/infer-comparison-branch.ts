import { Branch } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { GitHubRepository } from '../../../models/github-repository'
import { IRemote } from '../../../models/remote'
import { Repository } from '../../../models/repository'
import { ComparisonCache } from '../../comparison-cache'
import { urlMatchesCloneURL } from '../../repository-matching'

type RemotesGetter = (repository: Repository) => Promise<ReadonlyArray<IRemote>>

/**
 * Infers which branch to use as the comparison branch
 *
 * The branch returned is determined by the following conditions:
 * 1. Given a pull request -> target branch of PR
 * 2. Given a forked repository -> default branch on `upstream`
 * 3. Given a hosted repository -> default branch on `origin`
 * 4. Fallback -> `master` branch
 *
 * @param repository The repository the branch belongs to
 * @param branches The list of all branches for the repository
 * @param currentPullRequest The pull request to use for finding the branch
 * @param currentBranch The branch we want the parent of
 * @param getRemotes callback used to get all remotes for the current repository
 * @param comparisonCache cache used to get the number of commits ahead/behind the current branch is from another branch
 */
export async function inferComparisonBranch(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  currentPullRequest: PullRequest | null,
  currentBranch: Branch | null,
  getRemotes: RemotesGetter,
  comparisonCache: ComparisonCache
): Promise<Branch | null> {
  if (currentPullRequest !== null) {
    return getTargetBranchOfPullRequest(branches, currentPullRequest)
  }

  const ghRepo = repository.gitHubRepository
  if (ghRepo !== null) {
    return ghRepo.fork === true && currentBranch !== null
      ? getDefaultBranchOfFork(
          repository,
          branches,
          currentBranch,
          getRemotes,
          comparisonCache
        )
      : getDefaultBranchOfGitHubRepo(branches, ghRepo)
  }

  return getMasterBranch(branches)
}

function getMasterBranch(branches: ReadonlyArray<Branch>): Branch | null {
  return findBranch(branches, 'master')
}

function getDefaultBranchOfGitHubRepo(
  branches: ReadonlyArray<Branch>,
  ghRepository: GitHubRepository
): Branch | null {
  if (ghRepository.defaultBranch === null) {
    return null
  }

  return findBranch(branches, ghRepository.defaultBranch)
}

function getTargetBranchOfPullRequest(
  branches: ReadonlyArray<Branch>,
  pr: PullRequest
): Branch | null {
  return findBranch(branches, pr.base.ref)
}

/**
 * For `inferComparisonBranch` case where inferring for a forked repository
 *
 * Returns the default branch of the fork if it's ahead of `currentBranch`.
 * Otherwise, the default branch of the parent is returned.
 */
async function getDefaultBranchOfFork(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  currentBranch: Branch,
  getRemotes: RemotesGetter,
  comparisonCache: ComparisonCache
): Promise<Branch | null> {
  // this is guaranteed to exist since this function
  // is only called if the ghRepo is not null
  const ghRepo = repository.gitHubRepository!
  const defaultBranch = getDefaultBranchOfGitHubRepo(branches, ghRepo)
  if (defaultBranch === null) {
    return getMasterBranch(branches)
  }

  const aheadBehind = comparisonCache.get(
    currentBranch.tip.sha,
    defaultBranch.tip.sha
  )

  // we want to return the default branch of the fork if it's ahead
  // of the current branch; see https://github.com/desktop/desktop/issues/4766#issue-325764371
  if (aheadBehind !== null && aheadBehind.ahead > 0) {
    return defaultBranch
  }

  const potentialDefault = await getDefaultBranchOfForkedGitHubRepo(
    repository,
    branches,
    getRemotes
  )

  return potentialDefault
}

async function getDefaultBranchOfForkedGitHubRepo(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  getRemotes: RemotesGetter
): Promise<Branch | null> {
  const parentRepo =
    repository.gitHubRepository !== null
      ? repository.gitHubRepository.parent
      : null

  if (parentRepo === null) {
    return null
  }

  const remotes = await getRemotes(repository)
  const remote = remotes.find(r => urlMatchesCloneURL(r.url, parentRepo))

  if (remote === undefined) {
    log.warn(`Could not find remote with URL ${parentRepo.cloneURL}.`)
    return null
  }

  const branchToFind = `${remote.name}/${parentRepo.defaultBranch}`

  return findBranch(branches, branchToFind)
}

function findBranch(
  branches: ReadonlyArray<Branch>,
  name: string
): Branch | null {
  return branches.find(b => b.name === name) || null
}
