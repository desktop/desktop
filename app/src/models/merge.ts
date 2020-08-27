import { ComputedAction } from './computed-action'

interface IBlobResult {
  readonly mode: string
  readonly sha: string
  readonly path: string
}

export interface IMergeTreeEntry {
  readonly context: string
  readonly base?: IBlobResult
  readonly result?: IBlobResult
  readonly our?: IBlobResult
  readonly their?: IBlobResult
  readonly diff: string
  readonly hasConflicts?: boolean
}

export type MergeTreeSuccess = {
  readonly kind: ComputedAction.Clean
  readonly entries: ReadonlyArray<IMergeTreeEntry>
}

export type MergeTreeError = {
  readonly kind: ComputedAction.Conflicts
  readonly conflictedFiles: number
}

export type MergeTreeUnsupported = {
  readonly kind: ComputedAction.Invalid
}

export type MergeTreeLoading = {
  readonly kind: ComputedAction.Loading
}

export type MergeTreeResult =
  | MergeTreeSuccess
  | MergeTreeError
  | MergeTreeUnsupported
  | MergeTreeLoading
