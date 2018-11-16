/**
 * The repository conflict state, for use when generating the status. By default
 * this will only be populated when Git reports that there are files with
 * conflicts in the repository.
 */
export type ConflictState = {
  readonly filesWithConflictMarkers: Map<string, number>
}
