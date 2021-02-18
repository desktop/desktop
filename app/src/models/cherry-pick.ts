import { Branch } from './branch'
import { CommitOneLine } from './commit'
import { ICherryPickProgress } from './progress'

/** Represents a snapshot of the cherry pick state from the Git repository  */
export interface ICherryPickSnapshot {
  /** The sequence of commits remaining to be cherry picked */
  readonly remainingCommits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: ICherryPickProgress
}

/** Union type representing the possible states of the cherry pick flow */
export type CherryPickFlowStep = ChooseTargetBranchesStep

export const enum CherryPickStep {
  /**
   * The initial state of a cherry pick.
   *
   * This is where the user picks which is the target of the cherry pick.
   * This step will be skipped when cherry pick is initiated through
   * drag and drop onto a specific branch.
   */
  ChooseTargetBranch = 'ChooseTargetBranch',
}

/** Shape of data needed to choose the base branch for a cherry pick  */
export type ChooseTargetBranchesStep = {
  readonly kind: CherryPickStep.ChooseTargetBranch
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
}
