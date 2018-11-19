import { AppFileStatusKind } from '../models/status'
import { assertNever } from './fatal-error'

/**
 * Convert a given FileStatus value to a human-readable string to be
 * presented to users which describes the state of a file.
 *
 * Typically this will be the same value as that of the enum key.
 *
 * Used in file lists.
 */
export function mapStatus(status: AppFileStatusKind): string {
  switch (status) {
    case AppFileStatusKind.New:
      return 'New'
    case AppFileStatusKind.Modified:
      return 'Modified'
    case AppFileStatusKind.Deleted:
      return 'Deleted'
    case AppFileStatusKind.Renamed:
      return 'Renamed'
    case AppFileStatusKind.Conflicted:
      return 'Conflicted'
    case AppFileStatusKind.Resolved:
      return 'Resolved'
    case AppFileStatusKind.Copied:
      return 'Copied'
  }

  return assertNever(status, `Unknown file status ${status}`)
}
