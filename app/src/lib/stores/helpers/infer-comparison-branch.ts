import { Branch, IAheadBehind } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { GitHubRepository } from '../../../models/github-repository'
import { revRange } from '../../git'
import { IRemote } from '../../../models/remote'
import { Repository } from '../../../models/repository'

type RemotesGetter = (repository: Repository) => Promise<ReadonlyArray<IRemote>>
type AheadBehindGetter = (
  repository: Repository,
  range: string
) => Promise<IAheadBehind | null>

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
 * @param getAheadBehind callback used to calculate the number of commits ahead/behind the current branch is from another branch
 */
export async function inferComparisonBranch(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  currentPullRequest: PullRequest | null,
  currentBranch: Branch | null,
  getRemotes: RemotesGetter,
  getAheadBehind: AheadBehindGetter
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
          getAheadBehind
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
  getAheadBehind: AheadBehindGetter
): Promise<Branch | null> {
  // this is guaranteed to exist since this function
  // is only called if the ghRepo is not null
  const ghRepo = repository.gitHubRepository!
  const defaultBranch = getDefaultBranchOfGitHubRepo(branches, ghRepo)
  if (defaultBranch === null) {
    return getMasterBranch(branches)
  }

  const range = revRange(currentBranch.tip.sha, defaultBranch.tip.sha)
  const aheadBehind = await getAheadBehind(repository, range)
  if (aheadBehind !== null && aheadBehind.ahead > 0) {
    return defaultBranch
  }

  if (ghRepo.parent !== null && ghRepo.parent.defaultBranch !== null) {
    return getDefaultBranchOfForkedGitHubRepo(repository, branches, getRemotes)
  }

  return null
}

async function getDefaultBranchOfForkedGitHubRepo(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  getRemotes: RemotesGetter
): Promise<Branch | null> {
  // this is guaranteed to exist since this function
  // is only ever called if the ghRepo's parent is not null
  const parentRepo = repository.gitHubRepository!.parent!
  const remotes = await getRemotes(repository)
  const remote = remotes.find(r => r.url === parentRepo.cloneURL)

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
