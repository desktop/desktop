import { Branch } from './branch'

export enum StashAction {
  StashOnCurrentBranch,
  MoveToNewBranch,
}

export enum BranchActionKind {
  Checkout,
  Create,
}

export type BranchAction =
  | {
      type: BranchActionKind.Checkout
      branch: Branch
    }
  | {
      type: BranchActionKind.Create
      branchName: string
      startPoint: string | null
    }

export function getBranchName(postStashAction: BranchAction) {
  if (postStashAction.type === BranchActionKind.Checkout) {
    return postStashAction.branch.name
  }

  return postStashAction.branchName
}
