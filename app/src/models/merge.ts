import { ComputedAction } from './computed-action'
import { Branch } from './branch'
import { CommitOneLine } from './commit'

interface IBlobResult {
  readonly mode: string
  readonly sha: string
  readonly path: string
}

export interface IMergeEntry {
  readonly context: string
  readonly base?: IBlobResult
  readonly result?: IBlobResult
  readonly our?: IBlobResult
  readonly their?: IBlobResult
  readonly diff: string
  readonly hasConflicts?: boolean
}

interface ISupportedMergeInfo {
  readonly headBranch: Branch
  readonly commits: ReadonlyArray<CommitOneLine>
}

export type MergeClean = {
  readonly kind: ComputedAction.Clean
  readonly entries: ReadonlyArray<IMergeEntry>
} & ISupportedMergeInfo

export type MergeWithConflicts = {
  readonly kind: ComputedAction.Conflicts
  readonly conflictedFiles: number
} & ISupportedMergeInfo

export type MergeUnsupported = {
  readonly kind: ComputedAction.Invalid
  readonly headBranch: Branch
}

export type MergeLoading = {
  readonly kind: ComputedAction.Loading
  readonly headBranch: Branch
}

export type MergePreview =
  | MergeClean
  | MergeWithConflicts
  | MergeUnsupported
  | MergeLoading
