import * as Path from 'path'
import { ChildProcess } from 'child_process'
import * as FSE from 'fs-extra'
import { GitError } from 'dugite'
import * as byline from 'byline'

import { Repository } from '../../models/repository'
import { git, IGitResult, IGitExecutionOptions } from './core'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { stageManualConflictResolution } from './stage'
import { stageFiles } from './update-index'

import { getStatus } from './status'
import { RebaseContext } from '../../models/rebase'
import { IRebaseProgress } from '../../models/progress'
import { IGitProgress, IGitOutput, IGitProgressParser } from '../progress'
import { merge } from '../merge'

/**
 * Check the `.git/REBASE_HEAD` file exists in a repository to confirm
 * a rebase operation is underway.
 */
function isRebaseHeadSet(repository: Repository) {
  const path = Path.join(repository.path, '.git', 'REBASE_HEAD')
  return FSE.pathExists(path)
}

/**
 * Detect and build up the context about the rebase being performed on a
 * repository. This information is required to help Desktop display information
 * to the user about the current action as well as the options available.
 *
 * Returns `null` if no rebase is detected, or if the expected information
 * cannot be found in the repository.
 */
export async function getRebaseContext(
  repository: Repository
): Promise<RebaseContext | null> {
  const isRebase = await isRebaseHeadSet(repository)

  if (!isRebase) {
    return null
  }

  let originalBranchTip: string | null = null
  let targetBranch: string | null = null
  let baseBranchTip: string | null = null

  try {
    originalBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-apply', 'orig-head'),
      'utf8'
    )

    originalBranchTip = originalBranchTip.trim()

    targetBranch = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-apply', 'head-name'),
      'utf8'
    )

    if (targetBranch.startsWith('refs/heads/')) {
      targetBranch = targetBranch.substr(11).trim()
    }

    baseBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-apply', 'onto'),
      'utf8'
    )

    baseBranchTip = baseBranchTip.trim()
  } catch {}

  if (
    originalBranchTip != null &&
    targetBranch != null &&
    baseBranchTip != null
  ) {
    return { originalBranchTip, targetBranch, baseBranchTip }
  }

  // unable to resolve the rebase state of this repository

  return null
}

/**
 * A parser to read and emit rebase progress from Git `stdout`
 */
class GitRebaseParser implements IGitProgressParser {
  private currentCommitCount = 0

  public constructor(
    startCount: number,
    private readonly totalCommitCount: number
  ) {
    this.currentCommitCount = startCount
  }

  public parse(line: string): IGitProgress | IGitOutput {
    if (line.startsWith('Applying: ')) {
      this.currentCommitCount++
    }

    const percent = 100 * (this.currentCommitCount / this.totalCommitCount)

    return {
      kind: 'context',
      percent: percent,
      text: line,
    }
  }
}

/**
 * Reads `stdout` and uses the provided parser to emit progress to the caller.
 *
 * Our default progress parsing infrastructure reads `stderr` as this is how Git
 * typically emits progres, but `git rebase` is a special case. Our default
 * progress parsing also supports more general use cases, so this felt simpler
 * to implement as a first iteration than baking more complexity into the
 * defaults currently.
 *
 * @param parser the provided parser to process `stdout`
 * @param progressCallback the callback to invoke with received progress data
 */
function createStdoutProgressProcessCallback(
  parser: IGitProgressParser,
  progressCallback: (progress: IGitProgress | IGitOutput) => void
): (process: ChildProcess) => void {
  return process => {
    byline(process.stdout).on('data', (line: string) => {
      progressCallback(parser.parse(line))
    })
  }
}

/**
 * Options to pass in to rebase progress reporting
 */
export type RebaseProgressOptions = {
  /** The number of commits already rebased as part of the operation */
  start: number
  /** The number of commits to be rebased as part of the operation */
  total: number
  /** The callback to fire when rebase progress is reported */
  progressCallback: (progress: IRebaseProgress) => void
}

/**
 * A stub function to use for initiating rebase in the app.
 *
 * If the rebase fails, the repository will be in an indeterminate state where
 * the rebase is stuck.
 *
 * If the rebase completes without error, `featureBranch` will be checked out
 * and it will probably have a different commit history.
 *
 * @param baseBranch the ref to start the rebase from
 * @param targetBranch the ref to rebase onto `baseBranch`
 */
export async function rebase(
  repository: Repository,
  baseBranch: string,
  targetBranch: string
): Promise<RebaseResult> {
  const result = await git(
    ['rebase', baseBranch, targetBranch],
    repository.path,
    'rebase',
    { expectedErrors: new Set([GitError.RebaseConflicts]) }
  )

  return parseRebaseResult(result)
}

/** Abandon the current rebase operation */
export async function abortRebase(repository: Repository) {
  await git(['rebase', '--abort'], repository.path, 'abortRebase')
}

/** The app-specific results from attempting to rebase a repository */
export enum RebaseResult {
  /**
   * Git completed the rebase without reporting any errors, and the caller can
   * signal success to the user.
   */
  CompletedWithoutError = 'CompletedWithoutError',
  /**
   * The rebase encountered conflicts while attempting to rebase, and these
   * need to be resolved by the user before the rebase can continue.
   */
  ConflictsEncountered = 'ConflictsEncountered',
  /**
   * The rebase was not able to continue as tracked files were not staged in
   * the index.
   */
  OutstandingFilesNotStaged = 'OutstandingFilesNotStaged',
  /**
   * The rebase was not attempted because it could not check the status of the
   * repository. The caller needs to confirm the repository is in a usable
   * state.
   */
  Aborted = 'Aborted',
}

function parseRebaseResult(result: IGitResult): RebaseResult {
  if (result.exitCode === 0) {
    return RebaseResult.CompletedWithoutError
  }

  if (result.gitError === GitError.RebaseConflicts) {
    return RebaseResult.ConflictsEncountered
  }

  if (result.gitError === GitError.UnresolvedConflicts) {
    return RebaseResult.OutstandingFilesNotStaged
  }

  throw new Error(`Unhandled result found: '${JSON.stringify(result)}'`)
}

/**
 * Proceed with the current rebase operation and report back on whether it completed
 *
 * It is expected that the index has staged files which are cleanly rebased onto
 * the base branch, and the remaining unstaged files are those which need manual
 * resolution or were changed by the user to address inline conflicts.
 *
 */
export async function continueRebase(
  repository: Repository,
  files: ReadonlyArray<WorkingDirectoryFileChange>,
  manualResolutions: ReadonlyMap<string, ManualConflictResolution> = new Map()
): Promise<RebaseResult> {
  const trackedFiles = files.filter(f => {
    return f.status.kind !== AppFileStatusKind.Untracked
  })

  // apply conflict resolutions
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

  const otherFiles = trackedFiles.filter(f => !manualResolutions.has(f.path))

  await stageFiles(repository, otherFiles)

  const status = await getStatus(repository)

  if (status == null) {
    log.warn(
      `[rebase] unable to get status after staging changes, skipping any other steps`
    )
    return RebaseResult.Aborted
  }

  const trackedFilesAfter = status.workingDirectory.files.filter(
    f => f.status.kind !== AppFileStatusKind.Untracked
  )

  if (trackedFilesAfter.length === 0) {
    const rebaseHead = Path.join(repository.path, '.git', 'REBASE_HEAD')
    const rebaseCurrentCommit = await FSE.readFile(rebaseHead, 'utf8')

    log.warn(
      `[rebase] no tracked changes to commit for ${rebaseCurrentCommit.trim()}, continuing rebase but skipping this commit`
    )

    const result = await git(
      ['rebase', '--skip'],
      repository.path,
      'continueRebaseSkipCurrentCommit',
      {
        expectedErrors: new Set([
          GitError.RebaseConflicts,
          GitError.UnresolvedConflicts,
        ]),
      }
    )

    return parseRebaseResult(result)
  }

  const result = await git(
    ['rebase', '--continue'],
    repository.path,
    'continueRebase',
    {
      expectedErrors: new Set([
        GitError.RebaseConflicts,
        GitError.UnresolvedConflicts,
      ]),
    }
  )

  return parseRebaseResult(result)
}
