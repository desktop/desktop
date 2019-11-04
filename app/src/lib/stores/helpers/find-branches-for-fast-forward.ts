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
    `skipping fast-forward for all branches as there are ${allEligibleBranches.length} eligible branches (Threshold is ${FastForwardBranchesThreshold} eligible branches).`
  )

  // we don't have to worry about this being a duplicate, because recent branches
  // never include the default branch (at least right now)
  const shortListBranches =
    defaultBranch !== null ? [...recentBranches, defaultBranch] : recentBranches

  const eligibleShortListBranches = shortListBranches.filter(b =>
    eligibleForFastForward(b, currentBranchName)
  )
  return eligibleShortListBranches
}
