// NOTE: These strings have semantic value, they're
// passed directly as `--ours` and `--theirs` to
// git checkout. Take care if ever
export enum ManualConflictResolutionKind {
  theirs = 'theirs',
  ours = 'ours',
}

export type ManualConflictResolution =
  | ManualConflictResolutionKind.theirs
  | ManualConflictResolutionKind.ours
