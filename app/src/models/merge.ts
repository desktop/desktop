import { ComputedActionKind } from './action'

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

export interface IMergeSuccess {
  readonly kind: ComputedActionKind.Clean
  readonly entries: ReadonlyArray<IMergeEntry>
}

export type IMergeError = {
  readonly kind: ComputedActionKind.Conflicts
  readonly conflictedFiles: number
}

export type IMergeUnsupported = {
  readonly kind: ComputedActionKind.Invalid
}

export type IMergeLoading = {
  readonly kind: ComputedActionKind.Loading
}

export type MergeResult =
  | IMergeSuccess
  | IMergeError
  | IMergeUnsupported
  | IMergeLoading
