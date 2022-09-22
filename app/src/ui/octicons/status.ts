import {
  AppFileStatusKind,
  AppFileStatus,
  isConflictWithMarkers,
} from '../../models/status'
import * as OcticonSymbol from './octicons.generated'
import { OcticonSymbolType } from '../octicons'
import { assertNever } from '../../lib/fatal-error'

/**
 * Converts a given `AppFileStatusKind` value to an Octicon symbol
 * presented to users when displaying the file path.
 *
 * Used in file lists.
 */
export function iconForStatus(status: AppFileStatus): OcticonSymbolType {
  switch (status.kind) {
    case AppFileStatusKind.New:
    case AppFileStatusKind.Untracked:
      return OcticonSymbol.diffAdded
    case AppFileStatusKind.Modified:
      return OcticonSymbol.diffModified
    case AppFileStatusKind.Deleted:
      return OcticonSymbol.diffRemoved
    case AppFileStatusKind.Renamed:
      return OcticonSymbol.diffRenamed
    case AppFileStatusKind.Conflicted:
      if (isConflictWithMarkers(status)) {
        const conflictsCount = status.conflictMarkerCount
        return conflictsCount > 0 ? OcticonSymbol.alert : OcticonSymbol.check
      }
      return OcticonSymbol.alert
    case AppFileStatusKind.Copied:
      return OcticonSymbol.diffAdded
    default:
      return assertNever(status, `Unknown file status ${status}`)
  }
}
