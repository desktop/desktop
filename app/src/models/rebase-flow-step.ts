import { Branch } from './branch'
import { RebaseConflictState } from '../lib/app-state'

/** Union type representing the possible states of the rebase flow */
export type RebaseFlowStep =
  | ChooseBranchesStep
  | ShowProgressStep
  | ShowConflictsStep
  | HideConflictsStep
  | ConfirmAbortStep
  | CompletedStep

export const enum RebaseStep {
  /**
   * The initial state of a rebase - the user choosing the start point.
   *
   * This is not encountered if the user tries to 'pull with rebase' and
   * encounters conflicts, because the rebase happens as part of the pull
   * operation and the only remaining work for the user is to resolve any
   * conflicts.
   */
  ChooseBranch = 'ChooseBranch',
  /**
   * After the user chooses which branch to use as the base branch for the
   * rebase, the progress view is shown indicating how the rebase work is
   * progressing.
   *
   * This should be the default view when there are no conflicts to address.
   */
  ShowProgress = 'ShowProgress',
  /**
   * The rebase has encountered a problem requiring the user to intervene and
   * resolve conflicts. This will be shown as a list of files and the conflict
   * state.
   *
   * Once the conflicts are resolved, the user can continue the rebase and the
   * view will switch back to `ShowProgress`.
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
   * If the user wishes to abort the in-progress rebase, and the user has
   * resolved conflicts at any point of the rebase, the application should ask
   * the user to confirm that they wish to abort.
   *
   * This is to ensure the user doesn't throw away their work attempting to
   * rebase the current branch.
   */
  ConfirmAbort = 'ConfirmAbort',
  /**
   * When the rebase is completed, the dialog should be closed and a success
   * banner shown to the user.
   */
  Completed = 'Completed',
}

/** Shape of data needed to choose the base branch for a rebase  */
export type ChooseBranchesStep = {
  readonly kind: RebaseStep.ChooseBranch
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly initialBranch?: Branch
}

/** Shape of data to show progress of the current rebase */
export type ShowProgressStep = {
  readonly kind: RebaseStep.ShowProgress

  /**
   * An optional action to run when the component is mounted.
   *
   * This is provided to the component because a rebase can be very fast, and we
   * want to defer the rebase action until after _something_ is shown to the
   * user.
   */
  readonly rebaseAction: (() => Promise<void>) | null
}

/** Shape of data to show conflicts that need to be resolved by the user */
export type ShowConflictsStep = {
  readonly kind: RebaseStep.ShowConflicts
  readonly conflictState: RebaseConflictState
}

/** Shape of data to track when user hides conflicts dialog */
export type HideConflictsStep = {
  readonly kind: RebaseStep.HideConflicts
}

/** Shape of data to use when confirming user should abort rebase */
export type ConfirmAbortStep = {
  readonly kind: RebaseStep.ConfirmAbort
  readonly targetBranch: string
  readonly baseBranch?: string
}

/** Shape of data to track when rebase has completed successfully */
export type CompletedStep = {
  readonly kind: RebaseStep.Completed
}
