export enum MergeResultKind {
  Loading = 'loading',
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
}

export interface IMergeSuccess {
  readonly kind: MergeResultKind.Clean
  readonly entries: ReadonlyArray<IMergeEntry>
}

export interface IMergeError {
  readonly kind: MergeResultKind.Conflicts
  readonly conflictedFiles: number
}

export type MergeResult = IMergeSuccess | IMergeError
