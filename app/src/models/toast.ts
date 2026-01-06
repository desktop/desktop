import { Emoji } from '../lib/emoji'
import { Popup } from './popup'

export enum ToastType {
  SuccessfulMerge = 'SuccessfulMerge',
  MergeConflictsFound = 'MergeConflictsFound',
  SuccessfulRebase = 'SuccessfulRebase',
  RebaseConflictsFound = 'RebaseConflictsFound',
  BranchAlreadyUpToDate = 'BranchAlreadyUpToDate',
  SuccessfulCherryPick = 'SuccessfulCherryPick',
  CherryPickConflictsFound = 'CherryPickConflictsFound',
  CherryPickUndone = 'CherryPickUndone',
  SquashUndone = 'SquashUndone',
  ReorderUndone = 'ReorderUndone',
  OpenThankYouCard = 'OpenThankYouCard',
  SuccessfulSquash = 'SuccessfulSquash',
  SuccessfulReorder = 'SuccessfulReorder',
  ConflictsFound = 'ConflictsFound',
  OSVersionNoLongerSupported = 'OSVersionNoLongerSupported',
}

export type Toast =
  | {
      readonly type: ToastType.SuccessfulMerge
      /** name of the branch that was merged into */
      readonly ourBranch: string
      /** name of the branch we merged into `ourBranch` */
      readonly theirBranch?: string
    }
  | {
      readonly type: ToastType.MergeConflictsFound
      /** name of the branch that is being merged into */
      readonly ourBranch: string
      /** popup to be shown from the toast */
      readonly popup: Popup
    }
  | {
      readonly type: ToastType.SuccessfulRebase
      /** name of the branch that was used to rebase */
      readonly targetBranch: string
      /** the branch that the current branch was rebased onto (if known) */
      readonly baseBranch?: string
    }
  | {
      readonly type: ToastType.RebaseConflictsFound
      /** name of the branch that was used to rebase */
      readonly targetBranch: string
      /** callback to run when user clicks on link in toast text */
      readonly onOpenDialog: () => void
    }
  | {
      readonly type: ToastType.BranchAlreadyUpToDate
      /** name of the branch that was merged into */
      readonly ourBranch: string
      /** name of the branch we merged into `ourBranch` */
      readonly theirBranch?: string
    }
  | {
      readonly type: ToastType.SuccessfulCherryPick
      /** name of the branch that was cherry picked to */
      readonly targetBranchName: string
      /** number of commits cherry picked */
      readonly count: number
      /** callback to run when user clicks undo link in toast */
      readonly onUndo: () => void
    }
  | {
      readonly type: ToastType.CherryPickConflictsFound
      /** name of the branch that the commits are being cherry picked onto */
      readonly targetBranchName: string
      /** callback to run when user clicks on link in toast text */
      readonly onOpenConflictsDialog: () => void
    }
  | {
      readonly type: ToastType.CherryPickUndone
      /** name of the branch that the commits were cherry picked onto */
      readonly targetBranchName: string
      /** number of commits cherry picked */
      readonly countCherryPicked: number
    }
  | {
      readonly type: ToastType.OpenThankYouCard
      readonly emoji: Map<string, Emoji>
      readonly onOpenCard: () => void
      readonly onThrowCardAway: () => void
    }
  | {
      readonly type: ToastType.SuccessfulSquash
      /** number of commits squashed */
      readonly count: number
      /** callback to run when user clicks undo link in toast */
      readonly onUndo: () => void
    }
  | {
      readonly type: ToastType.SquashUndone
      /** number of commits squashed */
      readonly commitsCount: number
    }
  | {
      readonly type: ToastType.SuccessfulReorder
      /** number of commits reordered */
      readonly count: number
      /** callback to run when user clicks undo link in toast */
      readonly onUndo: () => void
    }
  | {
      readonly type: ToastType.ReorderUndone
      /** number of commits reordered */
      readonly commitsCount: number
    }
  | {
      readonly type: ToastType.ConflictsFound
      /**
       * Description of the operation to continue
       * Examples:
       *  - rebasing <strong>target-branch-name</strong>
       *  - cherry-picking onto <strong>target-branch-name</strong>
       *  - squashing commits on <strong>target-branch-name</strong>
       */
      readonly operationDescription: string | JSX.Element
      /** callback to run when user clicks on link in toast text */
      readonly onOpenConflictsDialog: () => void
    }
  | { readonly type: ToastType.OSVersionNoLongerSupported }
