import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { parseMergeResult, MergeResult, MergeResultKind } from './merge-parser'

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

export async function mergeTree(
  repository: Repository,
  ours: Branch,
  theirs: Branch
): Promise<MergeResult | null> {
  const mergeBase = await getMergeBase(repository, ours.tip.sha, theirs.tip.sha)

  if (mergeBase === ours.tip.sha) {
    log.warn('[fast-forward merge] ours is behind theirs ')
    return { kind: MergeResultKind.Success, entries: [] }
  }

  if (mergeBase === theirs.tip.sha) {
    log.warn('[fast-forward merge] theirs is behind ours ')
    return { kind: MergeResultKind.Success, entries: [] }
  }

  const result = await git(
    ['merge-tree', mergeBase, ours.tip.sha, theirs.tip.sha],
    repository.path,
    'mergeTree'
  )
  const output = result.stdout
  return parseMergeResult(output)
}
