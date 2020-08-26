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

/**
 * Used to convert a `UncommittedChangesStrategyKind` into a
 * `UncommittedChangesStrategy` object. For example, the
 * user's preference is stored as a kind in state, which
 * must be translated into a strategy before it can be
 * used in stashing logic and methods.
 */
export function getUncommittedChangesStrategy(
  kind: UncommittedChangesStrategyKind
): UncommittedChangesStrategy {
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

/**
 * Parse a string into a valid `UncommittedChangesStrategyKind`,
 * if possible. Returns `null` if not.
 */
export function parseStrategy(
  strategy: string | null
): UncommittedChangesStrategyKind | null {
  switch (strategy) {
    case UncommittedChangesStrategyKind.AskForConfirmation:
      return UncommittedChangesStrategyKind.AskForConfirmation
    case UncommittedChangesStrategyKind.StashOnCurrentBranch:
      return UncommittedChangesStrategyKind.StashOnCurrentBranch
    case UncommittedChangesStrategyKind.MoveToNewBranch:
      return UncommittedChangesStrategyKind.MoveToNewBranch
    default:
      return null
  }
}
