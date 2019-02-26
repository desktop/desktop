export interface StashEntry {
  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The tip commit SHA at the time the entry was created. */
  readonly sha: string
}
