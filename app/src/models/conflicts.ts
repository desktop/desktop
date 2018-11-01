import { GitStatusEntry, UnmergedEntry } from './status'

export type ConflictFileStatus =
  | {
      readonly kind: 'text'
      readonly conflictMarkerCount: number
    }
  | {
      readonly kind: 'binary'
      /** The state of the file in the current branch */
      readonly us: GitStatusEntry
      /** THe state of the file in the other branch */
      readonly them: GitStatusEntry
    }

export type ConflictedFile = {
  path: string
  status: UnmergedEntry
}

export type ConflictState = {
  readonly binaryFilePathsInConflicts: ReadonlyArray<ConflictedFile>
  readonly filesWithConflictMarkers: Map<string, number>
}
