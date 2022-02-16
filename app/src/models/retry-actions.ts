import { Repository } from './repository'
import { CloneOptions } from './clone-options'
import { Branch } from './branch'
import { Commit, CommitOneLine, ICommitContext } from './commit'
import { WorkingDirectoryFileChange } from './status'
import { assertNever } from '../lib/fatal-error'

/** The types of actions that can be retried. */
export enum RetryActionType {
  Push = 1,
  Pull,
  Fetch,
  Clone,
  Checkout,
  Merge,
  Rebase,
  CherryPick,
  CreateBranchForCherryPick,
  Squash,
  Reorder,
  DiscardChanges,
}

/** The retriable actions and their associated data. */
export type RetryAction =
  | { type: RetryActionType.Push; repository: Repository }
  | { type: RetryActionType.Pull; repository: Repository }
  | { type: RetryActionType.Fetch; repository: Repository }
  | {
      type: RetryActionType.Clone
      name: string
      url: string
      path: string
      options: CloneOptions
    }
  | {
      type: RetryActionType.Checkout
      repository: Repository
      branch: Branch
    }
  | {
      type: RetryActionType.Merge
      repository: Repository
      currentBranch: string
      theirBranch: Branch
    }
  | {
      type: RetryActionType.Rebase
      repository: Repository
      baseBranch: Branch
      targetBranch: Branch
    }
  | {
      type: RetryActionType.CherryPick
      repository: Repository
      targetBranch: Branch
      commits: ReadonlyArray<CommitOneLine>
      sourceBranch: Branch | null
    }
  | {
      type: RetryActionType.CreateBranchForCherryPick
      repository: Repository
      targetBranchName: string
      startPoint: string | null
      noTrackOption: boolean
      commits: ReadonlyArray<CommitOneLine>
      sourceBranch: Branch | null
    }
  | {
      type: RetryActionType.Squash
      repository: Repository
      toSquash: ReadonlyArray<Commit>
      squashOnto: Commit
      lastRetainedCommitRef: string | null
      commitContext: ICommitContext
    }
  | {
      type: RetryActionType.Reorder
      repository: Repository
      commitsToReorder: ReadonlyArray<Commit>
      beforeCommit: Commit | null
      lastRetainedCommitRef: string | null
    }
  | {
      type: RetryActionType.DiscardChanges
      repository: Repository
      files: ReadonlyArray<WorkingDirectoryFileChange>
    }

/**
 * Returns a user-friendly string to describe the current retryAction.
 */
export function getRetryActionName(retryActionType: RetryActionType) {
  switch (retryActionType) {
    case RetryActionType.Checkout:
      return 'checkout'
    case RetryActionType.Pull:
      return 'pull'
    case RetryActionType.Merge:
      return 'merge'
    case RetryActionType.Rebase:
      return 'rebase'
    case RetryActionType.Clone:
      return 'clone'
    case RetryActionType.Fetch:
      return 'fetch'
    case RetryActionType.Push:
      return 'push'
    case RetryActionType.CherryPick:
    case RetryActionType.CreateBranchForCherryPick:
      return 'cherry-pick'
    case RetryActionType.Squash:
      return 'squash'
    case RetryActionType.Reorder:
      return 'reorder'
    case RetryActionType.DiscardChanges:
      return __DARWIN__ ? 'Discard Changes' : 'discard changes'
    default:
      assertNever(retryActionType, `Unknown retryAction: ${retryActionType}`)
  }
}
