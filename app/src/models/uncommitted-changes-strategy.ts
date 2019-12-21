import { IStashEntry } from './stash-entry'

export enum UncommittedChangesStrategyKind {
  AskForConfirmation = 'AskForConfirmation',
  StashOnCurrentBranch = 'StashOnCurrentBranch',
  MoveToNewBranch = 'MoveToNewBranch',
}

export const uncommittedChangesStrategyKindDefault: UncommittedChangesStrategyKind =
  UncommittedChangesStrategyKind.AskForConfirmation

export type UncommittedChangesStrategy =
  | { kind: UncommittedChangesStrategyKind.AskForConfirmation }
  | { kind: UncommittedChangesStrategyKind.StashOnCurrentBranch }
  | {
      kind: UncommittedChangesStrategyKind.MoveToNewBranch
      transientStashEntry: IStashEntry | null
    }

export const askToStash: UncommittedChangesStrategy = {
  kind: UncommittedChangesStrategyKind.AskForConfirmation,
}
export const stashOnCurrentBranch: UncommittedChangesStrategy = {
  kind: UncommittedChangesStrategyKind.StashOnCurrentBranch,
}
