import { AppFileStatusKind } from '../../models/status'
import { OcticonSymbol } from './octicons.generated'
import { assertNever } from '../../lib/fatal-error'

/**
 * Converts a given `AppFileStatusKind` value to an Octicon symbol
 * presented to users when displaying the file path.
 *
 * Used in file lists.
 */
export function iconForStatus(status: AppFileStatusKind): OcticonSymbol {
  switch (status) {
    case AppFileStatusKind.New:
      return OcticonSymbol.diffAdded
    case AppFileStatusKind.Modified:
      return OcticonSymbol.diffModified
    case AppFileStatusKind.Deleted:
      return OcticonSymbol.diffRemoved
    case AppFileStatusKind.Renamed:
      return OcticonSymbol.diffRenamed
    case AppFileStatusKind.Conflicted:
      return OcticonSymbol.alert
    case AppFileStatusKind.Resolved:
      return OcticonSymbol.check
    case AppFileStatusKind.Copied:
      return OcticonSymbol.diffAdded
  }

  return assertNever(status, `Unknown file status ${status}`)
}
