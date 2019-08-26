import { IBranchesState } from '../../app-state'
import { eligibleForFastForward, Branch } from '../../../models/branch'
import { TipState } from '../../../models/tip'

/** Figured out what branches are eligible to fast forward
 *
 * If all eligible branches count is more than `FastForwardBranchesThreshold`,
 * returns a shorter list of default and recent branches
 *
 * @param branchesState current branchesState for a repository
 * @param FastForwardBranchesThreshold threshold for returning a short list in place of an exhaustive one
 * @returns list of branches eligible for fast forward
 */
export function findBranchesForFastForward(
  branchesState: IBranchesState,
  FastForwardBranchesThreshold: number
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

  const shortListBranches =
    defaultBranch !== null ? [...recentBranches, defaultBranch] : recentBranches

  const eligibleShortListBranches = shortListBranches.filter(b =>
    eligibleForFastForward(b, currentBranchName)
  )
  return eligibleShortListBranches
}
