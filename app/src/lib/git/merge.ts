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
): Promise<void> {
  await git(['merge', branch], repository.path, 'merge')
}

export async function getMergeBase(
  repository: Repository,
  firstRef: string,
  secondRef: string
): Promise<string> {
  const process = await git(
    ['merge-base', firstRef, secondRef],
    repository.path,
    'merge-base'
  )
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
  console.time('getMergeBase')
  const mergeBase = await getMergeBase(repository, ours.tip.sha, theirs.tip.sha)
  console.timeEnd('getMergeBase')

  if (mergeBase === ours.tip.sha) {
    return { kind: MergeResultKind.Success, entries: [] }
  }

  if (mergeBase === theirs.tip.sha) {
    return { kind: MergeResultKind.Success, entries: [] }
  }

  console.time('mergeTree')
  const result = await spawnAndComplete(
    ['merge-tree', mergeBase, ours.tip.sha, theirs.tip.sha],
    repository.path,
    'mergeTree'
  )
  console.timeEnd('mergeTree')

  const output = result.output.toString()
  console.time('parseMergeResult')
  const mergeResult = parseMergeResult(output)
  console.timeEnd('parseMergeResult')
  return mergeResult
}
