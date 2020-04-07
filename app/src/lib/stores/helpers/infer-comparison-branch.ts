import { Branch } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { GitHubRepository } from '../../../models/github-repository'
import { IRemote } from '../../../models/remote'
import { Repository } from '../../../models/repository'
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
 * @param getRemotes callback used to get all remotes for the current repository
 */

export async function inferComparisonBranch(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  currentPullRequest: PullRequest | null,
  getRemotes: RemotesGetter
): Promise<Branch | null> {
  if (currentPullRequest !== null) {
    const prBranch = getTargetBranchOfPullRequest(branches, currentPullRequest)
    if (prBranch !== null) {
      return prBranch
    }
  }

  const ghRepo = repository.gitHubRepository

  if (ghRepo !== null) {
    if (ghRepo.fork) {
      const upstreamBranch = await getDefaultBranchOfForkedGitHubRepo(
        repository,
        branches,
        getRemotes
      )
      if (upstreamBranch !== null) {
        return upstreamBranch
      }
    }

    const originBranch = getDefaultBranchOfGitHubRepo(branches, ghRepo)
    if (originBranch !== null) {
      return originBranch
    }
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
