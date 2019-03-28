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

export type MergeSuccess = {
  readonly kind: ComputedActionKind.Clean
  readonly entries: ReadonlyArray<IMergeEntry>
}

export type MergeError = {
  readonly kind: ComputedActionKind.Conflicts
  readonly conflictedFiles: number
}

export type MergeUnsupported = {
  readonly kind: ComputedActionKind.Invalid
}

export type MergeLoading = {
  readonly kind: ComputedActionKind.Loading
}

export type MergeResult =
  | MergeSuccess
  | MergeError
  | MergeUnsupported
  | MergeLoading
