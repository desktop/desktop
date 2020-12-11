export enum MergeResultKind {
  Loading = 'loading',
  Invalid = 'invalid',
  Clean = 'clean',
  Conflicts = 'conflicts',
}

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
  readonly kind: MergeResultKind.Clean
  readonly entries: ReadonlyArray<IMergeEntry>
}

export interface IMergeError {
  readonly kind: MergeResultKind.Conflicts
  readonly conflictedFiles: number
}

export interface IMergeUnsupported {
  readonly kind: MergeResultKind.Invalid
}

export type MergeResult = IMergeSuccess | IMergeError | IMergeUnsupported
