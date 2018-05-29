import { TipState } from '../../../models/tip'
import { IBranchesState } from '../../app-state'
import { GitHubRepository } from '../../../models/github-repository'
import { ComparisonCache } from '../../comparison-cache'
import { Branch } from '../../../models/branch'
import { fatalError } from '../../fatal-error'

//TODO: figure out if it's better to return branch name or SHA
/**
 * Infers the branch to use as the compare-to branch
 * @param state
 * @param ghRepository
 */
export function inferCompareToBranch(
  state: IBranchesState,
  cache: ComparisonCache,
  ghRepository?: GitHubRepository
): Branch | null {
  const tip = state.tip
  const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

  if (currentBranch === null) {
    return fatalError('Cannot find base branch of non-existent current branch')
  }

  // If the current branch has a PR associated with it,
  // use the target branch of the PR
  const associatedPullRequest = state.currentPullRequest
  if (associatedPullRequest !== null) {
    return (
      state.allBranches.find(b => b.name === associatedPullRequest.base.ref) ||
      null
    )
  }

  if (ghRepository !== undefined) {
    if (ghRepository.fork) {
      // If the repository is a fork, use the default branch on upstream
      return inferCompareToBranchFromFork(
        currentBranch,
        state,
        cache,
        ghRepository
      )
    } else {
      // If the repository is hosted on GitHub, use the default branch on origin
      return (
        state.allBranches.find(
          b => b.upstream === ghRepository.defaultBranch
        ) || null
      )
    }
  }

  // Otherwise fall through to the local master branch
  return state.allBranches.find(b => b.name === 'master') || null
}

// if the repository is a fork, use the default branch on upstream
// otherwise use the default branch on origin
// if the repo is a fork, parent must exist(???)
function inferCompareToBranchFromFork(
  branch: Branch,
  state: IBranchesState,
  cache: ComparisonCache,
  ghRepository: GitHubRepository
): Branch | null {
  const defaultBranchName = ghRepository.defaultBranch

  // TODO: figure out if this branch is stored in branch list
  // TODO: figure out what to return
  if (defaultBranchName === null) {
    return null
  }

  const defaultBranch = state.allBranches.find(
    b => b.name === defaultBranchName
  )

  // TODO: figure out if it's a problem that
  // we don't store the branch in our branches list
  if (defaultBranch === undefined) {
    return null
  }

  const defaultBranchAheadBehind = cache.get(
    defaultBranch.tip.sha,
    branch.tip.sha
  )

  // Checking the default branch on the forked repository
  if (
    defaultBranchAheadBehind !== null &&
    defaultBranchAheadBehind.behind > 0
  ) {
    return defaultBranch.name
    return defaultBranch
  }

  // Fall through to default branch of the parent repository
  const parent = ghRepository.parent
  if (parent !== null && parent.defaultBranch !== null) {
    return (
      state.allBranches.find(b => b.upstream === parent.defaultBranch) || null
    )
  }

  return null
}
