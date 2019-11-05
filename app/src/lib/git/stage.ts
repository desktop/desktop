import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isConflictedFileStatus,
  isManualConflict,
  GitStatusEntry,
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
  if (!isManualConflict(status)) {
    log.error(
      `tried to manually resolve conflicted file with markers (${file.path})`
    )
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
