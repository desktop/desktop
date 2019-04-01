import { Popup } from './popup'

export enum BannerType {
  SuccessfulMerge = 'SuccessfulMerge',
  MergeConflictsFound = 'MergeConflictsFound',
  SuccessfulRebase = 'SuccessfulRebase',
  RebaseConflictsFound = 'RebaseConflictsFound',
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
      readonly onOpenDialog: () => Promise<void>
    }
