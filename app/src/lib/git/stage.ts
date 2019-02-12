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

// TODO: review and potentially unify usage with Commit.stageManualConflictResolution

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
): Promise<boolean> {
  const { status } = file

  // if somehow the file isn't in a conflicted state
  if (!isConflictedFileStatus(status)) {
    log.error(`tried to manually resolve unconflicted file (${file.path})`)
    return false
  }
  if (!isManualConflict(status)) {
    log.error(
      `tried to manually resolve conflicted file with markers (${file.path})`
    )
    return false
  }

  const chosen =
    manualResolution === ManualConflictResolutionKind.theirs
      ? status.entry.them
      : status.entry.us

  let exitCode: number = -1

  switch (chosen) {
    case GitStatusEntry.Deleted: {
      exitCode = (await git(
        ['rm', file.path],
        repository.path,
        'removeConflictedFile'
      )).exitCode
      break
    }
    case GitStatusEntry.Added:
    case GitStatusEntry.UpdatedButUnmerged: {
      exitCode = (await git(
        ['add', file.path],
        repository.path,
        'addConflictedFile'
      )).exitCode
      break
    }
    default:
      assertNever(chosen, 'unnacounted for git status entry possibility')
  }
  return exitCode === 0
}
