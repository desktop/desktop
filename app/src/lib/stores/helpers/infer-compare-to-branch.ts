import { GitHubRepository } from '../../../models/github-repository'
import { Branch, IAheadBehind } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'

//TODO: figure out if it's better to return branch name or SHA
/**
 * Infers the branch to use as the compare-to branch
 * @param state
 * @param ghRepository
 */
export function inferCompareToBranch(
  currentBranch: Branch,
  branches: ReadonlyArray<Branch>,
  currentPullRequest: PullRequest | null,
  ghRepository: GitHubRepository,
  getAheadBehind: (to: string, from: string) => IAheadBehind | null
): Branch | null {
  // If the current branch has a PR associated with it,
  // use the target branch of the PR
  if (currentPullRequest !== null) {
    return branches.find(b => b.name === currentPullRequest.base.ref) || null
  }

  if (ghRepository.fork) {
    // If the repository is a fork, use the default branch on upstream
    return inferCompareToBranchFromFork(
      currentBranch,
      branches,
      ghRepository,
      getAheadBehind
    )
  }

  // If the repository is hosted on GitHub, use the default branch on origin
  return branches.find(b => b.name === ghRepository.defaultBranch) || null
}

}

// if the repository is a fork, use the default branch on upstream
// otherwise use the default branch on origin
// if the repo is a fork, parent must exist(???)
function inferCompareToBranchFromFork(
  currentBranch: Branch,
  branches: ReadonlyArray<Branch>,
  ghRepository: GitHubRepository,
  getAheadBehind: (to: string, from: string) => IAheadBehind | null
): Branch | null {
  const defaultBranchName = ghRepository.defaultBranch

  // TODO: figure out if this branch is stored in branch list
  // TODO: figure out what to return
  if (defaultBranchName === null) {
    return null
  }

  const defaultBranch = branches.find(b => b.name === defaultBranchName)

  // TODO: figure out if it's a problem that
  // we don't store the branch in our branches list
  if (defaultBranch === undefined) {
    return null
  }

  // compute this inline
  const aheadBehind = getAheadBehind(
    defaultBranch.tip.sha,
    currentBranch.tip.sha
  )

  // Checking the default branch on the forked repository
  if (aheadBehind !== null && aheadBehind.behind > 0) {
    return defaultBranch
  }

  // Fall through to default branch of the parent repository
  const parent = ghRepository.parent
  if (parent !== null && parent.defaultBranch !== null) {
    return branches.find(b => b.name === parent.defaultBranch) || null
  }

  return null
}
