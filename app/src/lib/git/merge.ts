import * as FSE from 'fs-extra'
import * as Path from 'path'

import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { MergeResult, MergeResultKind } from '../../models/merge'
import { parseMergeResult } from '../merge-tree-parser'
import { spawnAndComplete } from './spawn'

/** Merge the named branch into the current branch. */
export async function merge(
  repository: Repository,
  branch: string
): Promise<true> {
  await git(['merge', branch], repository.path, 'merge')
  return true
}

/**
 * Find the base commit between two commit-ish identifiers
 *
 * @returns the commit id of the merge base, or null if the two commit-ish
 *          identifiers do not have a common base
 */
export async function getMergeBase(
  repository: Repository,
  firstCommitish: string,
  secondCommitish: string
): Promise<string | null> {
  const process = await git(
    ['merge-base', firstCommitish, secondCommitish],
    repository.path,
    'merge-base',
    {
      // - 1 is returned if a common ancestor cannot be resolved
      // - 128 is returned if a ref cannot be found
      //   "warning: ignoring broken ref refs/remotes/origin/master."
      successExitCodes: new Set([0, 1, 128]),
    }
  )

  if (process.exitCode === 1 || process.exitCode === 128) {
    return null
  }

  return process.stdout.trim()
}

/**
 * Generate the merge result from two branches in a repository
 *
 * @param repository The repository containing the branches to merge
 * @param ours The current branch
 * @param theirs Another branch to merge into the current branch
 */
export async function mergeTree(
  repository: Repository,
  ours: Branch,
  theirs: Branch
): Promise<MergeResult | null> {
  const mergeBase = await getMergeBase(repository, ours.tip.sha, theirs.tip.sha)

  if (mergeBase === null) {
    return { kind: MergeResultKind.Invalid }
  }

  if (mergeBase === ours.tip.sha || mergeBase === theirs.tip.sha) {
    return { kind: MergeResultKind.Clean, entries: [] }
  }

  const result = await spawnAndComplete(
    ['merge-tree', mergeBase, ours.tip.sha, theirs.tip.sha],
    repository.path,
    'mergeTree'
  )

  const output = result.output.toString()

  if (output.length === 0) {
    // the merge commit will be empty - this is fine!
    return { kind: MergeResultKind.Clean, entries: [] }
  }

  return parseMergeResult(output)
}

/**
 * Abort a mid-flight (conflicted) merge
 *
 * @param repository where to abort the merge
 */
export async function abortMerge(repository: Repository): Promise<void> {
  await git(['merge', '--abort'], repository.path, 'abortMerge')
}

/**
 * Check the `.git/MERGE_HEAD` file exists in a repository to confirm
 * that it is in a conflicted state.
 */
export async function isMergeHeadSet(repository: Repository): Promise<boolean> {
  const path = Path.join(repository.path, '.git', 'MERGE_HEAD')
  return FSE.pathExists(path)
}
