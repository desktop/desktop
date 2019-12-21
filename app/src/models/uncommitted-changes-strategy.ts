import { IStashEntry } from './stash-entry'
import { assertNever } from '../lib/fatal-error'

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
export const moveToNewBranch: UncommittedChangesStrategy = {
  kind: UncommittedChangesStrategyKind.MoveToNewBranch,
  transientStashEntry: null,
}

export function getUncommittedChangesStrategy(
  kind: UncommittedChangesStrategyKind
) {
  switch (kind) {
    case UncommittedChangesStrategyKind.AskForConfirmation:
      return askToStash
    case UncommittedChangesStrategyKind.MoveToNewBranch:
      return moveToNewBranch
    case UncommittedChangesStrategyKind.StashOnCurrentBranch:
      return stashOnCurrentBranch
    default:
      return assertNever(
        kind,
        `Unknown UncommittedChangesStrategyKind: ${kind}`
      )
  }
}
