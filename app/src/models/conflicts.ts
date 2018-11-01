import { GitStatusEntry, UnmergedEntry } from './status'

/**
 * The conflict details attached to a file in the working directory.
 *
 * Conflicts can be either textual, in which case Git will try and merge the
 * changes and defer to the user to address any outstanding conflicts, or
 * binary, which need to be reviewed by the user and a decision made.
 */
export type ConflictFileStatus =
  | {
      readonly kind: 'text'
      /** This number should be greater than zero */
      readonly conflictMarkerCount: number
    }
  | {
      readonly kind: 'binary'
      /** The state of the file in the current branch */
      readonly us: GitStatusEntry
      /** THe state of the file in the other branch */
      readonly them: GitStatusEntry
    }

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
