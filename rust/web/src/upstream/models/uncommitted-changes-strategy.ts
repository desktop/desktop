export enum UncommittedChangesStrategy {
  AskForConfirmation = 'AskForConfirmation',
  StashOnCurrentBranch = 'StashOnCurrentBranch',
  MoveToNewBranch = 'MoveToNewBranch',
}

export const defaultUncommittedChangesStrategy: UncommittedChangesStrategy =
  UncommittedChangesStrategy.AskForConfirmation
