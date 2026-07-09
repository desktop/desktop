import { Branch } from '../models/branch'
import {
  ChooseBranchStep,
  conflictSteps,
  MultiCommitOperationStepKind,
} from '../models/multi-commit-operation'
import { Popup, PopupType } from '../models/popup'
import { Repository } from '../models/repository'
import { TipState } from '../models/tip'
import { IMultiCommitOperationState, IRepositoryState } from './app-state'

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
 * Returns whether the currently displayed popup is a multi commit operation
 * popup (e.g. the conflict resolution dialog) that belongs to a repository
 * other than the one provided.
 *
 * Each linked worktree is tracked as its own repository and is polled for
 * status independently, so a status refresh for one repository must not
 * assume that the current popup (if any) belongs to it — otherwise it could
 * tear down another repository's in-progress conflict resolution UI.
 */
export function isMultiCommitOperationPopupForAnotherRepository(
  currentPopup: Popup | null,
  repository: Repository
): boolean {
  return (
    currentPopup !== null &&
    currentPopup.type === PopupType.MultiCommitOperation &&
    currentPopup.repository.hash !== repository.hash
  )
}
