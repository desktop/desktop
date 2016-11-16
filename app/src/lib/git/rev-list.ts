import { GitProcess, GitError } from 'git-kitchen-sink'
import { git, GitError as InternalGitError } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'

/** The number of commits a revision range is ahead/behind. */
export interface IAheadBehind {
  readonly ahead: number
  readonly behind: number
}

/** Get the number of commits in HEAD. */
export async function getCommitCount(repository: Repository): Promise<number> {
  const result = await git([ 'rev-list', '--count', 'HEAD' ], repository.path, { successExitCodes: new Set([ 0, 128 ]) })
  // error code 128 is returned if the branch is unborn
  if (result.exitCode === 128) {
    return 0
  } else {
    const count = result.stdout
    return parseInt(count.trim(), 10)
  }
}

/** Calculate the number of commits the range is ahead and behind. */
async function getAheadBehind(repository: Repository, range: string): Promise<IAheadBehind | null> {
  // `--left-right` annotates the list of commits in the range with which side
  // they're coming from. When used with `--count`, it tells us how many
  // commits we have from the two different sides of the range.
  const args = [ 'rev-list', '--left-right', '--count', range, '--' ]
  const result = await git(args, repository.path, { successExitCodes: new Set([ 0, 128 ]) })
  if (result.exitCode === 128) {
    const error = GitProcess.parseError(result.stderr)
    // This means one of the refs (most likely the upstream branch) no longer
    // exists. In that case we can't be ahead/behind at all.
    if (error && error === GitError.BadRevision) {
      return null
    } else {
      throw new InternalGitError(result, args, error)
    }
  }

  const stdout = result.stdout
  const pieces = stdout.split('\t')
  if (pieces.length !== 2) { return null }

  const ahead = parseInt(pieces[0], 10)
  if (isNaN(ahead)) { return null }

  const behind = parseInt(pieces[1], 10)
  if (isNaN(behind)) { return null }

  return { ahead, behind }
}

/** Calculate the number of commits `branch` is ahead/behind its upstream. */
export async function getBranchAheadBehind(repository: Repository, branch: Branch): Promise<IAheadBehind | null> {
  if (branch.type === BranchType.Remote) {
    return null
  }

  const upstream = branch.upstream
  if (!upstream) { return null }

  // NB: The three dot form means we'll go all the way back to the merge base
  // of the branch and its upstream. Practically this is important for seeing
  // "through" merges.
  const range = `${branch.name}...${upstream}`
  return getAheadBehind(repository, range)
}
