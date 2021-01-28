export enum UncommittedChangesStrategy {
  AskForConfirmation = 'AskForConfirmation',
  StashOnCurrentBranch = 'StashOnCurrentBranch',
  MoveToNewBranch = 'MoveToNewBranch',
  DiscardAll = 'DiscardAll',
}

export const defaultUncommittedChangesStrategy: UncommittedChangesStrategy =
  UncommittedChangesStrategy.AskForConfirmation
