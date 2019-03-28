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
import { RebaseContext, RebaseProgressOptions } from '../../models/rebase'
import { merge } from '../merge'
import { IRebaseProgress } from '../../models/progress'

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
 * Attempt to read the `.git/REBASE_HEAD` file inside a repository to confirm
 * the rebase is still active.
 */
async function readRebaseHead(repository: Repository): Promise<string | null> {
  try {
    const rebaseHead = Path.join(repository.path, '.git', 'REBASE_HEAD')
    const rebaseCurrentCommitOutput = await FSE.readFile(rebaseHead, 'utf8')
    return rebaseCurrentCommitOutput.trim()
  } catch (err) {
    log.warn(
      '[rebase] a problem was encountered reading .git/REBASE_HEAD, so it is unsafe to continue rebasing',
      err
    )
    return null
  }
}

/** Regex for identifying when rebase applied each commit onto the base branch */
const rebaseApplyingRe = /^Applying: (.*)/

/**
 * A parser to read and emit rebase progress from Git `stdout`
 */
class GitRebaseParser {
  private currentCommitCount = 0

  public constructor(
    startCount: number,
    private readonly totalCommitCount: number
  ) {
    this.currentCommitCount = startCount
  }

  public parse(line: string): IRebaseProgress | null {
    const match = rebaseApplyingRe.exec(line)
    if (match === null || match.length !== 2) {
      // Git will sometimes emit other output (for example, when it tries to
      // resolve conflicts) and this does not match the expected output
      return null
    }

    const commitSummary = match[1]
    this.currentCommitCount++

    const progress = this.currentCommitCount / this.totalCommitCount
    const value = formatRebaseValue(progress)

    return {
      kind: 'rebase',
      title: `Rebasing commit ${this.currentCommitCount} of ${
        this.totalCommitCount
      } commits`,
      value,
      count: this.currentCommitCount,
      total: this.totalCommitCount,
      commitSummary,
    }
  }
}

function configureOptionsForRebase(
  options: IGitExecutionOptions,
  progress?: RebaseProgressOptions
) {
  if (progress === undefined) {
    return options
  }

  const { start, total, progressCallback } = progress

  return merge(options, {
    processCallback: (process: ChildProcess) => {
      const parser = new GitRebaseParser(start, total)

      // rebase emits progress messages on `stdout`, not `stderr`
      byline(process.stdout).on('data', (line: string) => {
        const progress = parser.parse(line)

        if (progress != null) {
          progressCallback(progress)
        }
      })
    },
  })
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
  targetBranch: string,
  progress?: RebaseProgressOptions
): Promise<RebaseResult> {
  const options = configureOptionsForRebase(
    {
      expectedErrors: new Set([GitError.RebaseConflicts]),
    },
    progress
  )

  const result = await git(
    ['rebase', baseBranch, targetBranch],
    repository.path,
    'rebase',
    options
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
  /**
   * An unexpected error as part of the rebase flow was caught and handled.
   *
   * Check the logs to find the relevant Git details.
   */
  Error = 'Error',
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
  manualResolutions: ReadonlyMap<string, ManualConflictResolution> = new Map(),
  progress?: RebaseProgressOptions
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

  const rebaseCurrentCommit = await readRebaseHead(repository)
  if (rebaseCurrentCommit === null) {
    return RebaseResult.Aborted
  }

  const trackedFilesAfter = status.workingDirectory.files.filter(
    f => f.status.kind !== AppFileStatusKind.Untracked
  )

  const options = configureOptionsForRebase(
    {
      expectedErrors: new Set([
        GitError.RebaseConflicts,
        GitError.UnresolvedConflicts,
      ]),
    },
    progress
  )

  if (trackedFilesAfter.length === 0) {
    log.warn(
      `[rebase] no tracked changes to commit for ${rebaseCurrentCommit}, continuing rebase but skipping this commit`
    )

    const result = await git(
      ['rebase', '--skip'],
      repository.path,
      'continueRebaseSkipCurrentCommit',
      options
    )

    return parseRebaseResult(result)
  }

  const result = await git(
    ['rebase', '--continue'],
    repository.path,
    'continueRebase',
    options
  )

  return parseRebaseResult(result)
}
