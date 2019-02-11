import {
  AppFileStatusKind,
  AppFileStatus,
  ConflictedFileStatus,
  WorkingDirectoryStatus,
  isConflictWithMarkers,
  GitStatusEntry,
} from '../models/status'
import { assertNever } from './fatal-error'
import { ManualConflictResolution } from '../models/manual-conflict-resolution'

/**
 * Convert a given `AppFileStatusKind` value to a human-readable string to be
 * presented to users which describes the state of a file.
 *
 * Typically this will be the same value as that of the enum key.
 *
 * Used in file lists.
 */
export function mapStatus(status: AppFileStatus): string {
  switch (status.kind) {
    case AppFileStatusKind.New:
    case AppFileStatusKind.Untracked:
      return 'New'
    case AppFileStatusKind.Modified:
      return 'Modified'
    case AppFileStatusKind.Deleted:
      return 'Deleted'
    case AppFileStatusKind.Renamed:
      return 'Renamed'
    case AppFileStatusKind.Conflicted:
      if (isConflictWithMarkers(status)) {
        const conflictsCount = status.conflictMarkerCount
        return conflictsCount > 0 ? 'Conflicted' : 'Resolved'
      }

      return 'Conflicted'
    case AppFileStatusKind.Copied:
      return 'Copied'
  }

  return assertNever(status, `Unknown file status ${status}`)
}

/** Typechecker helper to identify conflicted files */
export function isConflictedFile(
  file: AppFileStatus
): file is ConflictedFileStatus {
  return file.kind === AppFileStatusKind.Conflicted
}

/**
 * Returns a value indicating whether any of the files in the
 * working directory is in a conflicted state. See `isConflictedFile`
 * for the definition of a conflicted file.
 */
export function hasConflictedFiles(
  workingDirectoryStatus: WorkingDirectoryStatus
): boolean {
  return workingDirectoryStatus.files.some(f => isConflictedFile(f.status))
}

/**
 * Determine if we have any conflict markers or if its been resolved manually
 */
export function hasUnresolvedConflicts(
  status: ConflictedFileStatus,
  manualResolution?: ManualConflictResolution
) {
  if (isConflictWithMarkers(status)) {
    // text file may have conflict markers present
    return status.conflictMarkerCount > 0
  }

  // binary file doesn't contain markers, so we check the manual resolution
  return manualResolution === undefined
}

/** the possible git status entries for a manually conflicted file status
 * only intended for use in this file, but could evolve into an official type someday
 */
type UnmergedStatusEntry =
  | GitStatusEntry.Added
  | GitStatusEntry.UpdatedButUnmerged
  | GitStatusEntry.Deleted

/** Returns a human-readable description for a chosen version of a file
 *  intended for use with manually resolved merge conficts
 */
export function getUnmergedStatusEntryDescription(
  entry: UnmergedStatusEntry,
  branch?: string
): string {
  const suffix = branch ? ` from ${branch}` : ''

  switch (entry) {
    case GitStatusEntry.Added:
      return `Using the added file${suffix}`
    case GitStatusEntry.UpdatedButUnmerged:
      return `Using the modified file${suffix}`
    case GitStatusEntry.Deleted:
      return `Using the deleted file${suffix}`
    default:
      return assertNever(entry, 'Unknown status entry to format')
  }
}

/** Returns a human-readable description for an available manual resolution method
 *  intended for use with manually resolved merge conficts
 */
export function getLabelForManualResolutionOption(
  entry: UnmergedStatusEntry,
  branch?: string
): string {
  const suffix = branch ? ` from ${branch}` : ''

  switch (entry) {
    case GitStatusEntry.Added:
      return `Use the added file${suffix}`
    case GitStatusEntry.UpdatedButUnmerged:
      return `Use the modified file${suffix}`
    case GitStatusEntry.Deleted:
      return `Use the deleted file${suffix}`
    default:
      return assertNever(entry, 'Unknown status entry to format')
  }
}
