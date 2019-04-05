import { StashedFileChanges } from './stash'

export interface IStashEntry {
  /** The name of the entry i.e., `stash@{0}` */
  readonly name: string

  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string

  readonly files: StashedFileChanges
}
