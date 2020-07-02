import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
  GitStatusEntry,
  isConflictWithMarkers,
} from '../../models/status'
import {
  ManualConflictResolution,
  ManualConflictResolutionKind,
} from '../../models/manual-conflict-resolution'
import { git } from '.'
import { assertNever } from '../fatal-error'

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
    manualResolution === ManualConflictResolutionKind.theirs
      ? status.entry.them
      : status.entry.us

  switch (chosen) {
    case GitStatusEntry.Deleted: {
      await git(['rm', file.path], repository.path, 'removeConflictedFile')
      break
    }
    case GitStatusEntry.Added: {
      await git(['add', file.path], repository.path, 'addConflictedFile')
      break
    }
    case GitStatusEntry.UpdatedButUnmerged: {
      const choiceFlag =
        manualResolution === ManualConflictResolutionKind.theirs
          ? 'theirs'
          : 'ours'
      await git(
        ['checkout', `--${choiceFlag}`, '--', file.path],
        repository.path,
        'checkoutConflictedFile'
      )
      await git(['add', file.path], repository.path, 'addConflictedFile')
      break
    }
    default:
      assertNever(chosen, 'unnacounted for git status entry possibility')
  }
}
