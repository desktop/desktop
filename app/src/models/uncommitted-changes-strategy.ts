export enum UncommittedChangesStrategy {
  AskForConfirmation = 'AskForConfirmation',
  StashOnCurrentBranch = 'StashOnCurrentBranch',
  MoveToNewBranch = 'MoveToNewBranch',
}

export const defaultUncommittedChangesStrategy: UncommittedChangesStrategy =
  UncommittedChangesStrategy.AskForConfirmation

/**
 * Parse a string into a valid `UncommittedChangesStrategy`,
 * if possible. Returns `null` if not.
 */
export function parseStrategy(
  strategy: string | null
): UncommittedChangesStrategy | null {
  switch (strategy) {
    case UncommittedChangesStrategy.AskForConfirmation:
      return UncommittedChangesStrategy.AskForConfirmation
    case UncommittedChangesStrategy.StashOnCurrentBranch:
      return UncommittedChangesStrategy.StashOnCurrentBranch
    case UncommittedChangesStrategy.MoveToNewBranch:
      return UncommittedChangesStrategy.MoveToNewBranch
    default:
      return null
  }
}
