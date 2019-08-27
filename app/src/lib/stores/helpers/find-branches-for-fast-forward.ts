import { IBranchesState } from '../../app-state'
import { eligibleForFastForward, Branch } from '../../../models/branch'
import { TipState } from '../../../models/tip'

/**
 * As fast-forwarding local branches is proportional to the number of local
 * branches, and is run after every fetch/push/pull, this is skipped when the
 * number of eligible branches is greater than a given threshold.
 */
const FastForwardBranchesThreshold = 20

/** Figured out what branches are eligible to fast forward
 *
 * If all eligible branches count is more than `FastForwardBranchesThreshold`,
 * returns a shorter list of default and recent branches
 *
 * @param branchesState current branchesState for a repository
 * @returns list of branches eligible for fast forward
 */
export function findBranchesForFastForward(
  branchesState: IBranchesState
): ReadonlyArray<Branch> {
  const { allBranches, tip, defaultBranch, recentBranches } = branchesState
  const currentBranchName = tip.kind === TipState.Valid ? tip.branch.name : null

  const allEligibleBranches = allBranches.filter(b =>
    eligibleForFastForward(b, currentBranchName)
  )

  if (allEligibleBranches.length < FastForwardBranchesThreshold) {
    return allEligibleBranches
  }
  log.info(
    `skipping fast-forward for all branches as there are ${
      allEligibleBranches.length
    } eligible branches (Threshold is ${FastForwardBranchesThreshold} eligible branches).`
  )

  // add default branch to list of recents
  const shortListBranches = addBranchIfEligibleAndUniqueish(
    defaultBranch,
    recentBranches
  )

  // make sure they are all eligible
  const eligibleShortListBranches = shortListBranches.filter(b =>
    eligibleForFastForward(b, currentBranchName)
  )

  return eligibleShortListBranches
}

/**
 * this really just exists to make sure we don't
 * duplicate a recent branch when we add the
 * default branch to this list
 */
function addBranchIfEligibleAndUniqueish(
  candidateBranch: Branch | null,
  branches: ReadonlyArray<Branch>
): ReadonlyArray<Branch> {
  if (candidateBranch && !branches.some(b => b.name === candidateBranch.name)) {
    return [candidateBranch, ...branches]
  }
  return branches
}
