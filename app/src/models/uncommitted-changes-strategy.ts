import { IStashEntry } from './stash-entry'

export enum uncommittedChangesStrategyKind {
  askForConfirmation,
  stashOnCurrentBranch,
  moveToNewBranch,
}

export type UncommittedChangesStrategy =
  | { kind: uncommittedChangesStrategyKind.askForConfirmation }
  | { kind: uncommittedChangesStrategyKind.stashOnCurrentBranch }
  | {
      kind: uncommittedChangesStrategyKind.moveToNewBranch
      transientStashEntry: IStashEntry | null
    }

export const askToStash: UncommittedChangesStrategy = {
  kind: uncommittedChangesStrategyKind.askForConfirmation,
}
export const stashOnCurrentBranch: UncommittedChangesStrategy = {
  kind: uncommittedChangesStrategyKind.stashOnCurrentBranch,
}
