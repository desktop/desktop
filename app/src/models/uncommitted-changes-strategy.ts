import { Branch } from './branch'

/**
 * Represents the various actions that can be
 * taken with uncommitted changes
 */
export enum UncommittedChangesAction {
  StashOnCurrentBranch,
  MoveToNewBranch,
}

/**
 * Represents the reasons why a branch
 * is being checked out
 */
export enum CheckoutAction {
  Checkout,
  Create,
}

/** Context used by stashing operations */
export type StashContext =
  | {
      kind: CheckoutAction.Checkout
      branch: Branch
    }
  | {
      kind: CheckoutAction.Create
      branchName: string
      startPoint: string | null
    }

/** Returns the branch name from stash context */
export function getBranchName(context: StashContext) {
  if (context.kind === CheckoutAction.Checkout) {
    return context.branch.name
  }

  return context.branchName
}
