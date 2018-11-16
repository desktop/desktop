import { UnmergedEntry } from './status'

/**
 * Meshing together the path and status information for a conflicted file,
 * because AppFileStatus lacks the granularity to understand what Git is
 * reporting.
 */
export type ConflictedFile = {
  path: string
  status: UnmergedEntry
}

/**
 * The repository conflict state, for use when generating the status. By default
 * this will only be populated when Git reports that there are files with
 * conflicts in the repository.
 */
export type ConflictState = {
  readonly binaryFilePathsInConflicts: ReadonlyArray<ConflictedFile>
  readonly filesWithConflictMarkers: Map<string, number>
}
