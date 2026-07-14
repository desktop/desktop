import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
  GitStatusEntry,
  isConflictWithMarkers,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { assertNever } from '../fatal-error'
import { removeConflictedFile } from './rm'
import { checkoutConflictedFile } from './checkout'
import { addConflictedFile } from './add'

/**
 * Stages a file with the given manual resolution method. Useful for resolving binary conflicts at commit-time.
 *
 * @param repository
 * @param file conflicted file to stage
 * @param manualResolution method to resolve the conflict of file
 * @returns true if successful, false if something went wrong
 */
export async function stageManualConflictResolution(
  repository: Repository,
  file: WorkingDirectoryFileChange,
  manualResolution: ManualConflictResolution
): Promise<void> {
  const { status } = file
  // if somehow the file isn't in a conflicted state
  if (!isConflictedFileStatus(status)) {
    log.error(`tried to manually resolve unconflicted file (${file.path})`)
    return
  }

  if (isConflictWithMarkers(status) && status.conflictMarkerCount === 0) {
    // If somehow the user used the Desktop UI to solve the conflict via ours/theirs
    // but afterwards resolved manually the conflicts via an editor, used the manually
    // resolved file.
    return
  }

  const chosen =
    manualResolution === ManualConflictResolution.theirs
      ? status.entry.them
      : status.entry.us

  const addedInBoth =
    status.entry.us === GitStatusEntry.Added &&
    status.entry.them === GitStatusEntry.Added

  if (chosen === GitStatusEntry.UpdatedButUnmerged || addedInBoth) {
    await checkoutConflictedFile(repository, file, manualResolution)
  }

  switch (chosen) {
    case GitStatusEntry.Deleted:
      return removeConflictedFile(repository, file)
    case GitStatusEntry.Added:
    case GitStatusEntry.UpdatedButUnmerged:
      return addConflictedFile(repository, file)
    default:
      assertNever(chosen, 'unaccounted for git status entry possibility')
  }
}
