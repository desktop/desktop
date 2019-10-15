import { FileChange, AppFileStatusKind } from '../models/status'

/**
 * Resolve the old path (for a rename or a copied change) or default to the
 * current path of a file
 */
export function getOldPathOrDefault(file: FileChange) {
  if (
    file.status.kind === AppFileStatusKind.Renamed ||
    file.status.kind === AppFileStatusKind.Copied
  ) {
    return file.status.oldPath
  } else {
    return file.path
  }
}
