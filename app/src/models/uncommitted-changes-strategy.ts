import { IStashEntry } from './stash-entry'

export enum UncommittedChangesStrategyKind {
  askForConfirmation,
  stashOnCurrentBranch,
  moveToNewBranch,
}

export type UncommittedChangesStrategy =
  | { kind: UncommittedChangesStrategyKind.askForConfirmation }
  | { kind: UncommittedChangesStrategyKind.stashOnCurrentBranch }
  | {
      kind: UncommittedChangesStrategyKind.moveToNewBranch
      transientStashEntry: IStashEntry | null
    }

export const askToStash: UncommittedChangesStrategy = {
  kind: UncommittedChangesStrategyKind.askForConfirmation,
}
export const stashOnCurrentBranch: UncommittedChangesStrategy = {
  kind: UncommittedChangesStrategyKind.stashOnCurrentBranch,
}
