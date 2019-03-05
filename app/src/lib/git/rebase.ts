import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitError } from 'dugite'

import { Repository } from '../../models/repository'
import { git, IGitResult } from './core'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { ManualConflictResolution } from '../../models/manual-conflict-resolution'
import { stageManualConflictResolution } from './stage'
import { stageFiles } from './update-index'

import { getStatus } from './status'
import { RebaseContext } from '../../models/rebase'

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

export enum RebaseResult {
  CompletedWithoutError = 'CompletedWithoutError',
  ConflictsEncountered = 'ConflictsEncountered',
  OutstandingFilesNotStaged = 'OutstandingFilesNotStaged',
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

  const otherFiles = files.filter(f => !manualResolutions.has(f.path))

  await stageFiles(repository, otherFiles)

  const status = await getStatus(repository)

  if (status == null) {
    log.warn(
      `[rebase] unable to get status after staging changes, skipping any other steps`
    )
    return RebaseResult.Aborted
  }

  const trackedFiles = status.workingDirectory.files.filter(
    f => f.status.kind !== AppFileStatusKind.Untracked
  )

  if (trackedFiles.length === 0) {
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
