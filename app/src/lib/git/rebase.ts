import * as Path from 'path'
import { ChildProcess } from 'child_process'
import * as FSE from 'fs-extra'
import { GitError } from 'dugite'
import byline from 'byline'

import { Repository } from '../../models/repository'
import {
  RebaseInternalState,
  RebaseProgressOptions,
  GitRebaseProgress,
} from '../../models/rebase'
import { IRebaseProgress } from '../../models/progress'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { CommitOneLine } from '../../models/commit'

import { merge } from '../merge'
import { formatRebaseValue } from '../rebase'

import {
  git,
  IGitResult,
  IGitExecutionOptions,
  gitRebaseArguments,
} from './core'
import { stageManualConflictResolution } from './stage'
import { stageFiles } from './update-index'
import { getStatus } from './status'
import { getCommitsBetweenCommits } from './rev-list'
import { Branch } from '../../models/branch'

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

/**
 * Check the `.git/REBASE_HEAD` file exists in a repository to confirm
 * a rebase operation is underway.
 */
function isRebaseHeadSet(repository: Repository) {
  const path = Path.join(repository.path, '.git', 'REBASE_HEAD')
  return FSE.pathExists(path)
}

/**
 * Get the internal state about the rebase being performed on a repository. This
 * information is required to help Desktop display information to the user
 * about the current action as well as the options available.
 *
 * Returns `null` if no rebase is detected, or if the expected information
 * cannot be found in the repository.
 */
export async function getRebaseInternalState(
  repository: Repository
): Promise<RebaseInternalState | null> {
  const isRebase = await isRebaseHeadSet(repository)

  if (!isRebase) {
    return null
  }

  let originalBranchTip: string | null = null
  let targetBranch: string | null = null
  let baseBranchTip: string | null = null

  try {
    originalBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'orig-head'),
      'utf8'
    )

    originalBranchTip = originalBranchTip.trim()

    targetBranch = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'head-name'),
      'utf8'
    )

    if (targetBranch.startsWith('refs/heads/')) {
      targetBranch = targetBranch.substr(11).trim()
    }

    baseBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'onto'),
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
 * Inspect the `.git/rebase-merge` folder and convert the current rebase state
 * into data that can be provided to the rebase flow to update the application
 * state.
 *
 * This is required when Desktop is not responsible for initiating the rebase:
 *
 *   - when a rebase outside Desktop encounters conflicts
 *   - when a `git pull --rebase` was run and encounters conflicts
 *
 */
export async function getRebaseSnapshot(
  repository: Repository
): Promise<{
  progress: GitRebaseProgress
  commits: ReadonlyArray<CommitOneLine>
} | null> {
  const rebaseHead = await isRebaseHeadSet(repository)
  if (!rebaseHead) {
    return null
  }

  let next: number = -1
  let last: number = -1
  let originalBranchTip: string | null = null
  let baseBranchTip: string | null = null

  // if the repository is in the middle of a rebase `.git/rebase-merge` will
  // contain all the patches of commits that are being rebased into
  // auto-incrementing files, e.g. `0001`, `0002`, `0003`, etc ...

  try {
    // this contains the patch number that was recently applied to the repository
    const nextText = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'msgnum'),
      'utf8'
    )

    next = parseInt(nextText, 10)

    if (isNaN(next)) {
      log.warn(
        `[getCurrentProgress] found '${nextText}' in .git/rebase-merge/msgnum which could not be parsed to a valid number`
      )
      next = -1
    }

    // this contains the total number of patches to be applied to the repository
    const lastText = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'end'),
      'utf8'
    )

    last = parseInt(lastText, 10)

    if (isNaN(last)) {
      log.warn(
        `[getCurrentProgress] found '${lastText}' in .git/rebase-merge/last which could not be parsed to a valid number`
      )
      last = -1
    }

    originalBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'orig-head'),
      'utf8'
    )

    originalBranchTip = originalBranchTip.trim()

    baseBranchTip = await FSE.readFile(
      Path.join(repository.path, '.git', 'rebase-merge', 'onto'),
      'utf8'
    )

    baseBranchTip = baseBranchTip.trim()
  } catch {}

  if (
    next > 0 &&
    last > 0 &&
    originalBranchTip !== null &&
    baseBranchTip !== null
  ) {
    const percentage = next / last
    const value = formatRebaseValue(percentage)

    const commits = await getCommitsBetweenCommits(
      repository,
      baseBranchTip,
      originalBranchTip
    )

    if (commits === null || commits.length === 0) {
      return null
    }

    // this number starts from 1, but our array of commits starts from 0
    const nextCommitIndex = next - 1

    const hasValidCommit =
      commits.length > 0 &&
      nextCommitIndex >= 0 &&
      nextCommitIndex <= commits.length

    const currentCommitSummary = hasValidCommit
      ? commits[nextCommitIndex].summary
      : null

    return {
      progress: {
        value,
        rebasedCommitCount: next,
        totalCommitCount: last,
        currentCommitSummary,
      },
      commits,
    }
  }

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
const rebasingRe = /^Rebasing \((\d+)\/(\d+)\)$/

/**
 * A parser to read and emit rebase progress from Git `stderr`
 */
class GitRebaseParser {
  public constructor(private readonly commits: ReadonlyArray<CommitOneLine>) {}

  public parse(line: string): IRebaseProgress | null {
    const match = rebasingRe.exec(line)
    if (match === null || match.length !== 3) {
      // Git will sometimes emit other output (for example, when it tries to
      // resolve conflicts) and this does not match the expected output
      return null
    }

    const rebasedCommitCount = parseInt(match[1], 10)
    const totalCommitCount = parseInt(match[2], 10)

    if (isNaN(rebasedCommitCount) || isNaN(totalCommitCount)) {
      return null
    }

    const currentCommitSummary =
      this.commits[rebasedCommitCount - 1]?.summary ?? ''

    const progress = rebasedCommitCount / totalCommitCount
    const value = formatRebaseValue(progress)

    return {
      kind: 'rebase',
      title: `Rebasing commit ${rebasedCommitCount} of ${totalCommitCount} commits`,
      value,
      rebasedCommitCount: rebasedCommitCount,
      totalCommitCount: totalCommitCount,
      currentCommitSummary,
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

  const { commits, progressCallback } = progress

  return merge(options, {
    processCallback: (process: ChildProcess) => {
      // If Node.js encounters a synchronous runtime error while spawning
      // `stderr` will be undefined and the error will be emitted asynchronously
      if (process.stderr === null) {
        return
      }
      const parser = new GitRebaseParser(commits)

      byline(process.stderr).on('data', (line: string) => {
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
  baseBranch: Branch,
  targetBranch: Branch,
  progressCallback?: (progress: IRebaseProgress) => void
): Promise<RebaseResult> {
  const baseOptions: IGitExecutionOptions = {
    expectedErrors: new Set([GitError.RebaseConflicts]),
  }

  let options = baseOptions

  if (progressCallback !== undefined) {
    const commits = await getCommitsBetweenCommits(
      repository,
      baseBranch.tip.sha,
      targetBranch.tip.sha
    )

    if (commits === null) {
      // BadRevision can be raised here if git rev-list is unable to resolve a
      // ref to a commit ID, so we need to signal to the caller that this rebase
      // is not possible to perform
      log.warn(
        'Unable to rebase these branches because one or both of the refs do not exist in the repository'
      )
      return RebaseResult.Error
    }

    options = configureOptionsForRebase(baseOptions, {
      commits,
      progressCallback,
    })
  }

  const result = await git(
    [...gitRebaseArguments(), 'rebase', baseBranch.name, targetBranch.name],
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
  progressCallback?: (progress: IRebaseProgress) => void
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
        `[continueRebase] couldn't find file ${path} even though there's a manual resolution for it`
      )
    }
  }

  const otherFiles = trackedFiles.filter(f => !manualResolutions.has(f.path))

  await stageFiles(repository, otherFiles)

  const status = await getStatus(repository)
  if (status == null) {
    log.warn(
      `[continueRebase] unable to get status after staging changes, skipping any other steps`
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

  const baseOptions: IGitExecutionOptions = {
    expectedErrors: new Set([
      GitError.RebaseConflicts,
      GitError.UnresolvedConflicts,
    ]),
    env: {
      GIT_EDITOR: ':',
    },
  }

  let options = baseOptions

  if (progressCallback !== undefined) {
    const snapshot = await getRebaseSnapshot(repository)

    if (snapshot === null) {
      log.warn(
        `[continueRebase] unable to get rebase status, skipping any other steps`
      )
      return RebaseResult.Aborted
    }

    options = configureOptionsForRebase(baseOptions, {
      commits: snapshot.commits,
      progressCallback,
    })
  }

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
