import { CommitOneLine } from './commit'
import { ICherryPickProgress } from './progress'

/** Represents a snapshot of the cherry pick state from the Git repository  */
export interface ICherryPickSnapshot {
  /** The sequence of commits remaining to be cherry picked */
  readonly remainingCommits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: ICherryPickProgress
}
