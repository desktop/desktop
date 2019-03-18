import { IRepositoryState, RebaseConflictState } from '../lib/app-state'
import {
  ChooseBranchesStep,
  RebaseStep,
  ShowConflictsStep,
} from '../models/rebase-flow-state'
import { Branch } from '../models/branch'
import { TipState } from '../models/tip'
import { WorkingDirectoryStatus } from '../models/status'

export const initializeNewRebaseFlow = (state: IRepositoryState) => {
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
    step: RebaseStep.ChooseBranch,
    defaultBranch,
    currentBranch,
    allBranches,
    recentBranches,
  }

  return initialState
}

export const initializeRebaseFlowForConflictedRepository = (
  workingDirectory: WorkingDirectoryStatus,
  conflictState: RebaseConflictState
) => {
  const { targetBranch, baseBranch, manualResolutions } = conflictState

  const initialState: ShowConflictsStep = {
    step: RebaseStep.ShowConflicts,
    targetBranch,
    baseBranch,
    workingDirectory,
    manualResolutions,
  }

  return initialState
}
