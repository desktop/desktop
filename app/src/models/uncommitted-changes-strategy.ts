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
