export enum UncommittedChangesStrategyKind {
  AskForConfirmation = 'AskForConfirmation',
  StashOnCurrentBranch = 'StashOnCurrentBranch',
  MoveToNewBranch = 'MoveToNewBranch',
}

export const uncommittedChangesStrategyKindDefault: UncommittedChangesStrategyKind =
  UncommittedChangesStrategyKind.AskForConfirmation

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
