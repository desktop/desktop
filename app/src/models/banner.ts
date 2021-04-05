import { Popup } from './popup'

export enum BannerType {
  SuccessfulMerge = 'SuccessfulMerge',
  MergeConflictsFound = 'MergeConflictsFound',
  SuccessfulRebase = 'SuccessfulRebase',
  RebaseConflictsFound = 'RebaseConflictsFound',
  BranchAlreadyUpToDate = 'BranchAlreadyUpToDate',
  SuccessfulCherryPick = 'SuccessfulCherryPick',
  CherryPickConflictsFound = 'CherryPickConflictsFound',
  CherryPickUndone = 'CherryPickUndone',
}

export type Banner =
  | {
      readonly type: BannerType.SuccessfulMerge
      /** name of the branch that was merged into */
      readonly ourBranch: string
      /** name of the branch we merged into `ourBranch` */
      readonly theirBranch?: string
    }
  | {
      readonly type: BannerType.MergeConflictsFound
      /** name of the branch that is being merged into */
      readonly ourBranch: string
      /** popup to be shown from the banner */
      readonly popup: Popup
    }
  | {
      readonly type: BannerType.SuccessfulRebase
      /** name of the branch that was used to rebase */
      readonly targetBranch: string
      /** the branch that the current branch was rebased onto (if known) */
      readonly baseBranch?: string
    }
  | {
      readonly type: BannerType.RebaseConflictsFound
      /** name of the branch that was used to rebase */
      readonly targetBranch: string
      /** callback to run when user clicks on link in banner text */
      readonly onOpenDialog: () => void
    }
  | {
      readonly type: BannerType.BranchAlreadyUpToDate
      /** name of the branch that was merged into */
      readonly ourBranch: string
      /** name of the branch we merged into `ourBranch` */
      readonly theirBranch?: string
    }
  | {
      readonly type: BannerType.SuccessfulCherryPick
      /** name of the branch that was cherry picked to */
      readonly targetBranchName: string
      /** number of commits cherry picked */
      readonly countCherryPicked: number
      /** callback to run when user clicks undo link in banner */
      readonly onUndoCherryPick: () => void
    }
  | {
      readonly type: BannerType.CherryPickConflictsFound
      /** name of the branch that the commits are being cherry picked onto */
      readonly targetBranchName: string
      /** callback to run when user clicks on link in banner text */
      readonly onOpenConflictsDialog: () => void
    }
  | {
      readonly type: BannerType.CherryPickUndone
      /** name of the branch that the commits were cherry picked onto */
      readonly targetBranchName: string
      /** number of commits cherry picked */
      readonly countCherryPicked: number
    }
