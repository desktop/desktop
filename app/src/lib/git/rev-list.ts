import { GitError } from 'dugite'
import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'

/**
 * Convert two refs into the Git range syntax representing the set of commits
 * that are reachable from `to` but excluding those that are reachable from
 * `from`.
 *
 * Each parameter can be the commit SHA or a ref name, or specify an empty
 * string to represent HEAD.
 *
 * @param from The start of the range
 * @param to The end of the range
 */
export function revRange(from: string, to: string) {
  return `${from}..${to}`
}

/**
 * Convert two refs into the Git symmetric difference syntax, which represents
 * the set of commits that are reachable from either `from` or `to` but not
 * from both.
 *
 * Each parameter can be the commit SHA or a ref name, or you can use an empty
 * string to represent HEAD.
 *
 * @param from The start of the range
 * @param to The end of the range
 */
export function revSymmetricDifference(from: string, to: string) {
  return `${from}...${to}`
}

/** Calculate the number of commits the range is ahead and behind. */
export async function getAheadBehind(
  repository: Repository,
  range: string
): Promise<IAheadBehind | null> {
  // `--left-right` annotates the list of commits in the range with which side
  // they're coming from. When used with `--count`, it tells us how many
  // commits we have from the two different sides of the range.
  const args = ['rev-list', '--left-right', '--count', range, '--']
  const result = await git(args, repository.path, 'getAheadBehind', {
    expectedErrors: new Set([GitError.BadRevision]),
  })

  // This means one of the refs (most likely the upstream branch) no longer
  // exists. In that case we can't be ahead/behind at all.
  if (result.gitError === GitError.BadRevision) {
    return null
  }

  const stdout = result.stdout
  const pieces = stdout.split('\t')
  if (pieces.length !== 2) {
    return null
  }

  const ahead = parseInt(pieces[0], 10)
  if (isNaN(ahead)) {
    return null
  }

  const behind = parseInt(pieces[1], 10)
  if (isNaN(behind)) {
    return null
  }

  return { ahead, behind }
}

/** Calculate the number of commits `branch` is ahead/behind its upstream. */
export async function getBranchAheadBehind(
  repository: Repository,
  branch: Branch
): Promise<IAheadBehind | null> {
  if (branch.type === BranchType.Remote) {
    return null
  }

  const upstream = branch.upstream
  if (!upstream) {
    return null
  }

  // NB: The three dot form means we'll go all the way back to the merge base
  // of the branch and its upstream. Practically this is important for seeing
  // "through" merges.
  const range = revSymmetricDifference(branch.name, upstream)
  return getAheadBehind(repository, range)
}
