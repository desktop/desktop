import { IBranchesState } from '../lib/app-state'
import { IAheadBehind } from '../models/branch'
import { TipState } from '../models/tip'
import { clamp } from './clamp'

/**
 * Format rebase percentage to ensure it's a value between 0 and 1, but to also
 * constrain it to two significant figures, avoiding the remainder that comes
 * with floating point division.
 */
export function formatRebaseValue(value: number) {
  return Math.round(clamp(value, 0, 1) * 100) / 100
}

/**
 * Check application state to see whether the action applied to the current
 * branch should be a force push
 */
export function isCurrentBranchForcePush(
  branchesState: IBranchesState,
  aheadBehind: IAheadBehind | null
) {
  if (aheadBehind === null) {
    // no tracking branch found
    return false
  }

  const { tip, forcePushBranches } = branchesState
  const { ahead, behind } = aheadBehind

  let canForcePushBranch = false
  if (tip.kind === TipState.Valid) {
    const localBranchName = tip.branch.nameWithoutRemote
    const { sha } = tip.branch.tip
    const foundEntry = forcePushBranches.get(localBranchName)
    canForcePushBranch = foundEntry === sha
  }

  return canForcePushBranch && behind > 0 && ahead > 0
}
