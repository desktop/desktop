import { IBranchesState } from '../lib/app-state'
import { IAheadBehind } from '../models/branch'
import { TipState } from '../models/tip'
import { clamp } from './clamp'

/** Represents the force-push availability state of a branch. */
export enum ForcePushBranchState {
  /** The branch cannot be force-pushed (it hasn't diverged from its upstream) */
  NotAvailable,

  /**
   * The branch can be force-pushed, but the user didn't do any operation that
   * we consider should be followed by a force-push, like rebasing or amending a
   * pushed commit.
   */
  Available,

  /**
   * The branch can be force-pushed, and the user did some operation that we
   * consider should be followed by a force-push, like rebasing or amending a
   * pushed commit.
   */
  Recommended,
}

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
export function getCurrentBranchForcePushState(
  branchesState: IBranchesState,
  aheadBehind: IAheadBehind | null
): ForcePushBranchState {
  if (aheadBehind === null) {
    // no tracking branch found
    return ForcePushBranchState.NotAvailable
  }

  const { ahead, behind } = aheadBehind

  if (behind === 0 || ahead === 0) {
    // no a diverged branch to force push
    return ForcePushBranchState.NotAvailable
  }

  const { tip, forcePushBranches } = branchesState

  let canForcePushBranch = false
  if (tip.kind === TipState.Valid) {
    const localBranchName = tip.branch.nameWithoutRemote
    const { sha } = tip.branch.tip
    const foundEntry = forcePushBranches.get(localBranchName)
    canForcePushBranch = foundEntry === sha
  }

  return canForcePushBranch
    ? ForcePushBranchState.Recommended
    : ForcePushBranchState.Available
}
