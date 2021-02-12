import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitError } from 'dugite'
import { Repository } from '../../models/repository'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../models/status'
import { git, IGitExecutionOptions, IGitResult } from './core'
import { getStatus } from './status'
import { stageFiles } from './update-index'

/** The app-specific results from attempting to cherry pick commits*/
export enum CherryPickResult {
  /**
   * Git completed the cherry pick without reporting any errors, and the caller can
   * signal success to the user.
   */
  CompletedWithoutError = 'CompletedWithoutError',
  /**
   * The cherry pick encountered conflicts while attempting to cherry pick and
   * need to be resolved before the user can continue.
   */
  ConflictsEncountered = 'ConflictsEncountered',
  /**
   * The cherry pick was not able to continue as tracked files were not staged in
   * the index.
   */
  OutstandingFilesNotStaged = 'OutstandingFilesNotStaged',
  /**
   * The cherry pick was not attempted because it could not check the status of
   * the repository. The caller needs to confirm the repository is in a usable
   * state.
   */
  Aborted = 'Aborted',
  /**
   * An unexpected error as part of the cherry pick flow was caught and handled.
   *
   * Check the logs to find the relevant Git details.
   */
  Error = 'Error',
}

/**
 * A stub function to initiate cherry picking in the app.
 *
 * @param revisionRange - this could be a single commit sha or could be a range
 * of commits like sha1..sha2 or inclusively sha1^..sha2
 */
export async function cherryPick(
  repository: Repository,
  revisionRange: string
): Promise<CherryPickResult> {
  const baseOptions: IGitExecutionOptions = {
    expectedErrors: new Set([GitError.MergeConflicts]),
  }

  const result = await git(
    ['cherry-pick', revisionRange],
    repository.path,
    'cherry pick',
    baseOptions
  )

  return parseCherryPickResult(result)
}

function parseCherryPickResult(result: IGitResult): CherryPickResult {
  if (result.exitCode === 0) {
    return CherryPickResult.CompletedWithoutError
  }

  switch (result.gitError) {
    case GitError.MergeConflicts:
      return CherryPickResult.ConflictsEncountered
    case GitError.UnresolvedConflicts:
      return CherryPickResult.OutstandingFilesNotStaged
    default:
      throw new Error(`Unhandled result found: '${JSON.stringify(result)}'`)
  }
}

/**
 * Proceed with the current cherry pick operation and report back on whether it completed
 *
 * It is expected that the index has staged files which are cleanly cherry
 * picked onto the base branch, and the remaining unstaged files are those which
 * need manual resolution or were changed by the user to address inline
 * conflicts.
 *
 * @param files - The working directory of files. These are the files that are
 * detected to have changes that we want to stage for the cherry pick.
 */
export async function continueCherryPick(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>
): Promise<CherryPickResult> {
  // only stage files related to cherry pick
  const trackedFiles = files.filter(f => {
    return f.status.kind !== AppFileStatusKind.Untracked
  })
  await stageFiles(repository, trackedFiles)

  const status = await getStatus(repository)
  if (status == null) {
    log.warn(
      `[continueCherryPick] unable to get status after staging changes,
        skipping any other steps`
    )
    return CherryPickResult.Aborted
  }

  // make sure cherry pick is still in progress to continue
  const cherryPickCurrentCommit = await readCherryPickHead(repository)
  if (cherryPickCurrentCommit === null) {
    return CherryPickResult.Aborted
  }

  const options: IGitExecutionOptions = {
    expectedErrors: new Set([
      GitError.MergeConflicts,
      GitError.UnresolvedConflicts,
    ]),
    env: {
      // if we don't provide editor, we can't detect git errors
      GIT_EDITOR: ':',
    },
  }

  const result = await git(
    ['cherry-pick', '--continue'],
    repository.path,
    'continueCherryPick',
    options
  )

  return parseCherryPickResult(result)
}

/** Abandon the current cherry pick operation */
export async function abortCherryPick(repository: Repository) {
  await git(['cherry-pick', '--abort'], repository.path, 'abortCherryPick')
}

/**
 * Attempt to read the `.git/CHERRY_PICK_HEAD` file inside a repository to confirm
 * the cherry pick is still active.
 */
async function readCherryPickHead(
  repository: Repository
): Promise<string | null> {
  try {
    const cherryPickHead = Path.join(
      repository.path,
      '.git',
      'CHERRY_PICK_HEAD'
    )
    const cherryPickCurrentCommitOutput = await FSE.readFile(
      cherryPickHead,
      'utf8'
    )
    return cherryPickCurrentCommitOutput.trim()
  } catch (err) {
    log.warn(
      `[cherryPick] a problem was encountered reading .git/CHERRY_PICK_HEAD,
       so it is unsafe to continue cherry picking`,
      err
    )
    return null
  }
}
