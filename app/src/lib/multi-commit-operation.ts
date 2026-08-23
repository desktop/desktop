import { Branch } from '../models/branch'
import {
  ChooseBranchStep,
  conflictSteps,
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../models/multi-commit-operation'
import { TipState } from '../models/tip'
import {
  ConflictState,
  IMultiCommitOperationState,
  IRepositoryState,
} from './app-state'

/**
 * Setup the multi commit operation state when the user needs to select a branch as the
 * base for the operation.
 */
export function getMultiCommitOperationChooseBranchStep(
  state: IRepositoryState,
  initialBranch?: Branch | null
): ChooseBranchStep {
  const { defaultBranch, allBranches, recentBranches, tip } =
    state.branchesState
  let currentBranch: Branch | null = null

  if (tip.kind === TipState.Valid) {
    currentBranch = tip.branch
  } else {
    throw new Error(
      'Tip is not in a valid state, which is required to start the multi commit operation'
    )
  }

  return {
    kind: MultiCommitOperationStepKind.ChooseBranch,
    defaultBranch,
    currentBranch,
    allBranches,
    recentBranches,
    initialBranch: initialBranch !== null ? initialBranch : undefined,
  }
}

export function isConflictsFlow(
  isMultiCommitOperationPopupOpen: boolean,
  multiCommitOperationState: IMultiCommitOperationState | null
): boolean {
  return (
    isMultiCommitOperationPopupOpen &&
    multiCommitOperationState !== null &&
    conflictSteps.includes(multiCommitOperationState.step.kind)
  )
}

/**
 * Determine whether a rebase-based operation which was waiting for conflict
 * resolution has ended outside of Desktop.
 *
 * A rebase which is merely staged and ready to continue still has rebase
 * metadata and therefore a conflict state. If that state disappears while the
 * operation is in a conflict step, Git has either completed or aborted the
 * operation externally and the in-memory operation state is stale.
 */
export function hasExternalRebaseConflictFlowEnded(
  conflictState: ConflictState | null,
  multiCommitOperationState: IMultiCommitOperationState | null
): boolean {
  if (conflictState !== null || multiCommitOperationState === null) {
    return false
  }

  const { kind } = multiCommitOperationState.operationDetail
  const isRebaseBasedOperation =
    kind === MultiCommitOperationKind.Rebase ||
    kind === MultiCommitOperationKind.Reorder ||
    kind === MultiCommitOperationKind.Squash

  if (!isRebaseBasedOperation) {
    return false
  }

  const stepKind = multiCommitOperationState.step.kind
  return (
    stepKind === MultiCommitOperationStepKind.HideConflicts ||
    conflictSteps.includes(stepKind)
  )
}
