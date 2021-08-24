import { CommitOneLine } from './commit'
import { IMultiCommitOperationProgress } from './progress'

/** Represents a snapshot of the cherry pick state from the Git repository  */
export interface ICherryPickSnapshot {
  /** The sequence of commits remaining to be cherry picked */
  readonly remainingCommits: ReadonlyArray<CommitOneLine>
  /** The sequence of commits being cherry picked */
  readonly commits: ReadonlyArray<CommitOneLine>
  /** The progress of the operation */
  readonly progress: IMultiCommitOperationProgress
  /** The sha of the target branch tip before cherry pick initiated. */
  readonly targetBranchUndoSha: string
  /** The number of commits already cherry-picked */
  readonly cherryPickedCount: number
}
