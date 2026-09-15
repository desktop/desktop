// NOTE: These strings have semantic value, they're passed directly
// as `--ours` and `--theirs` to git checkout. Please be careful
// when modifying this type.
export enum ManualConflictResolution {
  theirs = 'theirs',
  ours = 'ours',
}
