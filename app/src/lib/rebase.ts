import {
  IRepositoryState,
  RebaseConflictState,
  IBranchesState,
} from '../lib/app-state'
import {
  ChooseBranchesStep,
  RebaseStep,
  ShowConflictsStep,
} from '../models/rebase-flow-step'
import { Branch, IAheadBehind } from '../models/branch'
import { TipState } from '../models/tip'
import { clamp } from './clamp'

/**
 * Setup the rebase flow state when the user neeeds to select a branch as the
 * base for the operation.
 */
export function initializeNewRebaseFlow(state: IRepositoryState) {
  const {
    defaultBranch,
    allBranches,
    recentBranches,
    tip,
  } = state.branchesState
  let currentBranch: Branch | null = null

  if (tip.kind === TipState.Valid) {
    currentBranch = tip.branch
  } else {
    throw new Error(
      'Tip is not in a valid state, which is required to start the rebase flow'
    )
  }

  const initialState: ChooseBranchesStep = {
    kind: RebaseStep.ChooseBranch,
    defaultBranch,
    currentBranch,
    allBranches,
    recentBranches,
  }

  return initialState
}

/**
 * Setup the rebase flow when rebase conflicts are detected in the repository.
 *
 * This indicates a rebase is in progress, and the application needs to guide
 * the user to resolve conflicts and complete the rebae.
 *
 * @param conflictState current set of conflicts
 */
export function initializeRebaseFlowForConflictedRepository(
  conflictState: RebaseConflictState
): ShowConflictsStep {
  const initialState: ShowConflictsStep = {
    kind: RebaseStep.ShowConflicts,
    conflictState,
  }
  return initialState
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
export function isCurrentBranchForcePush(
  branchesState: IBranchesState,
  aheadBehind: IAheadBehind | null
) {
  if (aheadBehind === null) {
    // no tracking branch found
    return false
  }

  const { tip, rebasedBranches } = branchesState
  const { ahead, behind } = aheadBehind

  let branchWasRebased = false
  if (tip.kind === TipState.Valid) {
    const localBranchName = tip.branch.nameWithoutRemote
    const { sha } = tip.branch.tip
    const foundEntry = rebasedBranches.get(localBranchName)
    branchWasRebased = foundEntry === sha
  }

  return branchWasRebased && behind > 0 && ahead > 0
}
