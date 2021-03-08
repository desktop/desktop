import { CherryPickConflictState } from '../lib/app-state'
import { Branch } from './branch'
import { CommitOneLine } from './commit'
import { ICherryPickProgress } from './progress'

/** Represents a snapshot of the cherry pick state from the Git repository  */
export interface ICherryPickSnapshot {
  /** The sequence of commits remaining to be cherry picked */
  readonly remainingCommits: ReadonlyArray<CommitOneLine>
  /** The sequence of commits being cherry picked */
  readonly commits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: ICherryPickProgress
  /** The sha of the target branch tip before cherry pick initiated. */
  readonly targetBranchUndoSha: string
}

/** Union type representing the possible states of the cherry pick flow */
export type CherryPickFlowStep =
  | ChooseTargetBranchesStep
  | ShowProgressStep
  | ShowConflictsStep
  | CommitsChosenStep
  | HideConflictsStep
  | ConfirmAbortStep

export const enum CherryPickStepKind {
  /**
   * An initial state of a cherry pick.
   *
   * This is where the user has started dragging a commit or set of commits but
   * has not yet dropped them on a branch or an area to launch to choose branch
   * dialog.
   */
  CommitsChosen = 'CommitsChosen',

  /**
   * An initial state of a cherry pick.
   *
   * This is where the user picks which is the target of the cherry pick.
   * This step will be skipped when cherry pick is initiated through
   * drag and drop onto a specific branch. But, it will be the first step
   * if the cherry pick is initiated through the context menu.
   */
  ChooseTargetBranch = 'ChooseTargetBranch',

  /**
   * After the user chooses the target branch of the cherry pick, the
   * progress view shows the cherry pick is progressing.
   *
   * This should be the default view when there are no conflicts to address.
   */
  ShowProgress = 'ShowProgress',

  /**
   * The cherry pick has encountered conflicts that need resolved. This will be
   * shown as a list of files and the conflict state.
   *
   * Once the conflicts are resolved, the user can continue the cherry pick and
   * the view will switch back to `ShowProgress`.
   */
  ShowConflicts = 'ShowConflicts',

  /**
   * The user may wish to leave the conflict dialog and view the files in
   * the Changes tab to get a better context. In this situation, the application
   * will show a banner to indicate this context and help the user return to the
   * conflicted list.
   */
  HideConflicts = 'HideConflicts',

  /**
   * If the user attempts to abort the in-progress cherry pick and the user has
   * resolved conflicts, the application should ask the user to confirm that
   * they wish to abort.
   */
  ConfirmAbort = 'ConfirmAbort',
}

/** Shape of data needed to choose the base branch for a cherry pick  */
export type ChooseTargetBranchesStep = {
  readonly kind: CherryPickStepKind.ChooseTargetBranch
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
}

/** Shape of data to show progress of the current cherry pick */
export type ShowProgressStep = {
  readonly kind: CherryPickStepKind.ShowProgress
}

/** Shape of data to show conflicts that need to be resolved by the user */
export type ShowConflictsStep = {
  readonly kind: CherryPickStepKind.ShowConflicts
  conflictState: CherryPickConflictState
}

/** Shape of data to track when user hides conflicts dialog */
export type HideConflictsStep = {
  readonly kind: CherryPickStepKind.HideConflicts
}

/**
 * Shape of data for when a user has chosen commits to cherry pick but not yet
 * selected a target branch.
 */
export type CommitsChosenStep = {
  readonly kind: CherryPickStepKind.CommitsChosen
  commits: ReadonlyArray<CommitOneLine>
}

/** Shape of data to use when confirming user should abort cherry pick */
export type ConfirmAbortStep = {
  readonly kind: CherryPickStepKind.ConfirmAbort
  readonly conflictState: CherryPickConflictState
}
