import { Branch } from '../models/branch'
import { CommitOneLine } from '../models/commit'
import {
  ChooseBranchStep,
  conflictSteps,
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../models/multi-commit-operation'
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
 * How a rebase should proceed given the current multi commit operation state.
 *
 *  - `proceed`: the state describes the rebase we're about to perform and the
 *    commits it applies to are already known.
 *  - `restore`: there is no operation in progress, so the state has to be
 *    rebuilt before the rebase can run.
 *  - `abort`: an unrelated multi commit operation is in progress and must not
 *    be clobbered by the rebase.
 */
export type RebaseOperationStateAction =
  | { readonly kind: 'proceed'; readonly commits: ReadonlyArray<CommitOneLine> }
  | { readonly kind: 'restore' }
  | { readonly kind: 'abort' }

/**
 * Determine how a rebase should proceed based on the multi commit operation
 * state currently held for the repository.
 *
 * A rebase relies on that state to track the commits being replayed and to
 * drive the progress dialog, but a failed rebase attempt clears it (see
 * `Dispatcher.rebase`). That includes a rebase blocked by uncommitted local
 * changes, which the user can recover from by stashing and retrying. The retry
 * doesn't go back through `Dispatcher.startRebase`, so the missing state has to
 * be restored rather than treated as a reason to silently give up.
 */
export function getRebaseOperationStateAction(
  multiCommitOperationState: IMultiCommitOperationState | null
): RebaseOperationStateAction {
  if (multiCommitOperationState === null) {
    return { kind: 'restore' }
  }

  const { operationDetail } = multiCommitOperationState

  if (operationDetail.kind !== MultiCommitOperationKind.Rebase) {
    return { kind: 'abort' }
  }

  return { kind: 'proceed', commits: operationDetail.commits }
}
