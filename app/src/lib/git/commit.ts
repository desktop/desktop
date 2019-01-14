import { git, GitError, parseCommitSHA } from './core'
import { stageFiles } from './update-index'
import { Repository } from '../../models/repository'
import {
  WorkingDirectoryFileChange,
  isManualConflict,
  isConflictedFileStatus,
  GitStatusEntry,
} from '../../models/status'
import { unstageAll } from './reset'
import {
  ManualConflictResolution,
  ManualConflictResolutionKind,
} from '../../models/manual-conflict-resolution'
import { assertNever } from '../fatal-error'

/**
 * @param repository repository to execute merge in
 * @param message commit message
 * @param files files to commit
 */
export async function createCommit(
  repository: Repository,
  message: string,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<string | undefined> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  await unstageAll(repository)

  await stageFiles(repository, files)

  try {
    const result = await git(
      ['commit', '-F', '-'],
      repository.path,
      'createCommit',
      {
        stdin: message,
      }
    )
    return parseCommitSHA(result)
  } catch (e) {
    logCommitError(e)
    return undefined
  }
}

/**
 * Creates a commit to finish an in-progress merge
 * assumes that all conflicts have already been resolved
 *
 * @param repository repository to execute merge in
 * @param files files to commit
 */
export async function createMergeCommit(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution> = new Map()
): Promise<string | undefined> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  try {
    await unstageAll(repository)

    // apply manual conflict resolutions
    for (const [path, resolution] of manualResolutions) {
      const file = files.find(f => f.path === path)
      if (file !== undefined) {
        await stageManualConflictResolution(repository, file, resolution)
      } else {
        log.error(
          `couldn't find file ${path} even though there's a manual resolution for it`
        )
      }
    }

    const otherFiles = files.filter(f => !manualResolutions.has(f.path))

    await stageFiles(repository, otherFiles)
    const result = await git(
      [
        'commit', // no-edit here ensures the app does not accidentally invoke the user's editor
        '--no-edit', // By default Git merge commits do not contain any commentary (which
        // are lines prefixed with `#`). This works because the Git CLI will
        // prompt the user to edit the file in `.git/COMMIT_MSG` before
        // committing, and then it will run `--cleanup=strip`.
        //
        // This clashes with our use of `--no-edit` above as Git will now change
        // it's behavior to invoke `--cleanup=whitespace` as it did not ask
        // the user to edit the COMMIT_MSG as part of creating a commit.
        //
        // From the docs on git-commit (https://git-scm.com/docs/git-commit) I'll
        // quote the relevant section:
        // --cleanup=<mode>
        //     strip
        //        Strip leading and trailing empty lines, trailing whitespace,
        //        commentary and collapse consecutive empty lines.
        //     whitespace
        //        Same as `strip` except #commentary is not removed.
        //     default
        //        Same as `strip` if the message is to be edited. Otherwise `whitespace`.
        //
        // We should emulate the behavior in this situation because we don't
        // let the user view or change the commit message before making the
        // commit.
        '--cleanup=strip',
      ],
      repository.path,
      'createMergeCommit'
    )
    return parseCommitSHA(result)
  } catch (e) {
    logCommitError(e)
    return undefined
  }
}

async function stageManualConflictResolution(
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

/**
 * Commit failures could come from a pre-commit hook rejection.
 * So display a bit more context than we otherwise would,
 * then re-raise the error.
 */
function logCommitError(e: Error): void {
  if (e instanceof GitError) {
    const output = e.result.stderr.trim()

    const standardError = output.length > 0 ? `, with output: '${output}'` : ''
    const { exitCode } = e.result
    const error = new Error(
      `Commit failed - exit code ${exitCode} received${standardError}`
    )
    error.name = 'commit-failed'
    throw error
  } else {
    throw e
  }
}
