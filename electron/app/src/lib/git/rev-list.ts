import { GitError } from 'dugite'
import { git } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType, IAheadBehind } from '../../models/branch'
import { CommitOneLine } from '../../models/commit'

/**
 * Convert two refs into the Git range syntax representing the set of commits
 * that are reachable from `to` but excluding those that are reachable from
 * `from`. This will not be inclusive to the `from` ref, see
 * `revRangeInclusive`.
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
 * Convert two refs into the Git range syntax representing the set of commits
 * that are reachable from `to` but excluding those that are reachable from
 * `from`. However as opposed to `revRange`, this will also include `from` ref.
 *
 * Each parameter can be the commit SHA or a ref name, or specify an empty
 * string to represent HEAD.
 *
 * @param from The start of the range
 * @param to The end of the range
 */
export function revRangeInclusive(from: string, to: string) {
  return `${from}^..${to}`
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

/**
 * Get a list of commits from the target branch that do not exist on the base
 * branch, ordered how they will be applied to the base branch.
 * Therefore, this will not include the baseBranchSha commit.
 *
 * This emulates how `git rebase` initially determines what will be applied to
 * the repository.
 *
 * Returns `null` when the rebase is not possible to perform, because of a
 * missing commit ID
 */
export async function getCommitsBetweenCommits(
  repository: Repository,
  baseBranchSha: string,
  targetBranchSha: string
): Promise<ReadonlyArray<CommitOneLine> | null> {
  const range = revRange(baseBranchSha, targetBranchSha)

  return getCommitsInRange(repository, range)
}

/**
 * Get a list of commits inside the provided range.
 *
 * Returns `null` when it is not possible to perform because of a bad range.
 */
export async function getCommitsInRange(
  repository: Repository,
  range: string
): Promise<ReadonlyArray<CommitOneLine> | null> {
  const args = [
    'rev-list',
    range,
    '--reverse',
    // the combination of these two arguments means each line of the stdout
    // will contain the full commit sha and a commit summary
    `--oneline`,
    `--no-abbrev-commit`,
    '--',
  ]

  const options = {
    expectedErrors: new Set<GitError>([GitError.BadRevision]),
  }

  const result = await git(args, repository.path, 'getCommitsInRange', options)

  if (result.gitError === GitError.BadRevision) {
    return null
  }

  const lines = result.stdout.split('\n')

  const commits = new Array<CommitOneLine>()

  const commitSummaryRe = /^([a-z0-9]{40}) (.*)$/

  for (const line of lines) {
    const match = commitSummaryRe.exec(line)

    if (match !== null && match.length === 3) {
      const sha = match[1]
      const summary = match[2]

      commits.push({
        sha,
        summary,
      })
    }
  }

  return commits
}

/**
 * Determine if merge commits exist in history after given commit
 * If commitRef is null, goes back to HEAD of branch.
 */
export async function doMergeCommitsExistAfterCommit(
  repository: Repository,
  commitRef: string | null
): Promise<boolean> {
  const revision = commitRef === null ? 'HEAD' : revRange(commitRef, 'HEAD')
  const args = ['rev-list', '-1', '--merges', revision, '--']

  return git(args, repository.path, 'doMergeCommitsExistAfterCommit', {
    // 128 here means there's no HEAD, i.e we're on an unborn branch
    successExitCodes: new Set([0, 128]),
  }).then(x => x.stdout.length > 0)
}
