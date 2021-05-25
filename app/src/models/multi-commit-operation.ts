import { Branch } from './branch'
import { CommitOneLine } from './commit'
import { GitHubRepository } from './github-repository'
import { ManualConflictResolution } from './manual-conflict-resolution'
import { IDetachedHead, IUnbornRepository, IValidBranch } from './tip'

/**
 * Enum of types of multi commit operations
 *
 * Note: These are used to output the operation to the user
 * and as such should be capitalized.
 */
export const enum MultiCommitOperationKind {
  Rebase = 'Rebase',
  CherryPick = 'Cherry-pick',
  Squash = 'Squash',
}

/**
 * Union type representing the possible states of an multi commit operation
 * such as rebase, interactive rebase, cherry-pick.
 */
export type MultiCommitOperationStep =
  | ChooseBranchStep
  | WarnForcePushStep
  | ShowProgressStep
  | ShowConflictsStep
  | HideConflictsStep
  | ConfirmAbortStep
  | CreateBranchStep

/**
 * Possible kinds of steps that may happen during a multi commit operation such
 * as rebase, interactive rebase, cherry-pick.
 */
export const enum MultiCommitOperationStepKind {
  /**
   * The step that the user picks which other branch is involved in the
   * operation asides from the currently checked out branch.
   *
   * Examples:
   *  Rebase - what branch to rebase commits from
   *  Cherry-pick - what branch to copy commits to.
   */
  ChooseBranch = 'ChooseBranch',

  /**
   * Step to show dialog warning user if operation will result in needing to
   * force push.
   */
  WarnForcePush = 'WarnForcePush',

  /**
   * Step to show a dialog that shows the operation is progressing.
   */
  ShowProgress = 'ShowProgress',

  /**
   * The operation has encountered conflicts that need resolved. This will be
   * shown as a list of files and the conflict state.
   *
   * Once the conflicts are resolved, the user can continue the operation.
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
   * If the user attempts to abort the in-progress operation and the user has
   * resolved conflicts, the application should ask the user to confirm that
   * they wish to abort.
   */
  ConfirmAbort = 'ConfirmAbort',

  /**
   * If the user invokes creating a new branch during the operation, display
   * a new branch dialog to them.
   *
   * Example: Cherry-picking to a new branch.
   */
  CreateBranch = 'CreateBranch',
}

export type ChooseBranchStep = {
  readonly kind: MultiCommitOperationStepKind.ChooseBranch
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly initialBranch?: Branch
}

export type WarnForcePushStep = {
  readonly kind: MultiCommitOperationStepKind.WarnForcePush
  readonly baseBranch: Branch
  readonly targetBranch: Branch
  readonly commits: ReadonlyArray<CommitOneLine>
}

export type ShowProgressStep = {
  readonly kind: MultiCommitOperationStepKind.ShowProgress
}

export type ShowConflictsStep = {
  readonly kind: MultiCommitOperationStepKind.ShowConflicts
  readonly manualResolutions: Map<string, ManualConflictResolution>
  /**
   * Depending on the operation, this may be either source branch or the
   * target branch.
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly ourBranch?: string

  /**
   * Depending on the operation, this may be either source branch or the
   * target branch
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly theirBranch?: string
}

export type HideConflictsStep = {
  readonly kind: MultiCommitOperationStepKind.HideConflicts
  readonly manualResolutions: Map<string, ManualConflictResolution>
  /**
   * Depending on the operation, this may be either source branch or the
   * target branch.
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly ourBranch?: string

  /**
   * Depending on the operation, this may be either source branch or the
   * target branch
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly theirBranch?: string
}

export type ConfirmAbortStep = {
  readonly kind: MultiCommitOperationStepKind.ConfirmAbort
  /**
   * Depending on the operation, this may be either source branch or the
   * target branch.
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly ourBranch?: string

  /**
   * Depending on the operation, this may be either source branch or the
   * target branch
   *
   * Also, we may not know what it is. This usually happens if Desktop is closed
   * during an operation and the reopened and we lose some context that is
   * stored in state.
   */
  readonly theirBranch?: string
  readonly manualResolutions: Map<string, ManualConflictResolution>
}

export type CreateBranchStep = {
  readonly kind: MultiCommitOperationStepKind.CreateBranch
  allBranches: ReadonlyArray<Branch>
  defaultBranch: Branch | null
  upstreamDefaultBranch: Branch | null
  upstreamGhRepo: GitHubRepository | null
  tip: IUnbornRepository | IDetachedHead | IValidBranch
  targetBranchName: string
}
