import {
  AppFileStatusKind,
  AppFileStatus,
  isConflictWithMarkers,
} from '../../models/status'
import * as octicons from './octicons.generated'
import { OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'

/**
 * Converts a given `AppFileStatusKind` value to an Octicon symbol
 * presented to users when displaying the file path.
 *
 * Used in file lists.
 */
export function iconForStatus(status: AppFileStatus): OcticonSymbol {
  switch (status.kind) {
    case AppFileStatusKind.New:
    case AppFileStatusKind.Untracked:
      return octicons.diffAdded
    case AppFileStatusKind.Modified:
      return octicons.diffModified
    case AppFileStatusKind.Deleted:
      return octicons.diffRemoved
    case AppFileStatusKind.Renamed:
      return octicons.diffRenamed
    case AppFileStatusKind.Conflicted:
      if (isConflictWithMarkers(status)) {
        const conflictsCount = status.conflictMarkerCount
        return conflictsCount > 0 ? octicons.alert : octicons.check
      }
      return octicons.alert
    case AppFileStatusKind.Copied:
      return octicons.diffAdded
    default:
      return assertNever(status, `Unknown file status ${status}`)
  }
}
