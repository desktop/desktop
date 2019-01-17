export enum ManualConflictResolutionKind {
  theirs = 'theirs',
  ours = 'ours',
}

export type ManualConflictResolution =
  | ManualConflictResolutionKind.theirs
  | ManualConflictResolutionKind.ours
