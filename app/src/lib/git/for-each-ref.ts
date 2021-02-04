import { git } from './core'
import { GitError } from 'dugite'
import { Repository } from '../../models/repository'
import {
  Branch,
  BranchType,
  IBranchTip,
  ITrackingBranch,
} from '../../models/branch'
import { CommitIdentity } from '../../models/commit-identity'
import { createForEachRefParser } from './git-delimiter-parser'

/** Get all the branches. */
export async function getBranches(
  repository: Repository,
  ...prefixes: string[]
): Promise<ReadonlyArray<Branch>> {
  const { formatArgs, parse } = createForEachRefParser({
    fullName: '%(refname)',
    shortName: '%(refname:short)',
    upstreamShortName: '%(upstream:short)',
    sha: '%(objectname)',
    author: '%(author)',
    symRef: '%(symref)',
  })

  if (!prefixes || !prefixes.length) {
    prefixes = ['refs/heads', 'refs/remotes']
  }

  // TODO: use expectedErrors here to handle a specific error
  // see https://github.com/desktop/desktop/pull/5299#discussion_r206603442 for
  // discussion about what needs to change
  const result = await git(
    ['for-each-ref', ...formatArgs, ...prefixes],
    repository.path,
    'getBranches',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const branches = []

  for (const ref of parse(result.stdout)) {
    // excude symbolic refs from the branch list
    if (ref.symRef.length > 0) {
      continue
    }

    const author = CommitIdentity.parseIdentity(ref.author)
    const tip: IBranchTip = { sha: ref.sha, author }

    const type = ref.fullName.startsWith('refs/heads')
      ? BranchType.Local
      : BranchType.Remote

    const upstream =
      ref.upstreamShortName.length > 0 ? ref.upstreamShortName : null

    branches.push(new Branch(ref.shortName, upstream, tip, type, ref.fullName))
  }

  return branches
}

/**
 * Gets all branches that differ from their upstream (i.e. they're ahead,
 * behind or both), excluding the current branch.
 * Useful to narrow down a list of branches that could potentially be fast
 * forwarded.
 *
 * @param repository Repository to get the branches from.
 */
export async function getBranchesDifferingFromUpstream(
  repository: Repository
): Promise<ReadonlyArray<ITrackingBranch>> {
  const format = [
    '%(refname)',
    '%(objectname)', // SHA
    '%(upstream)',
    '%(symref)',
    '%(HEAD)',
  ].join('%00')

  const prefixes = ['refs/heads', 'refs/remotes']

  const result = await git(
    ['for-each-ref', `--format=${format}`, ...prefixes],
    repository.path,
    'getBranchesDifferingFromUpstream',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const lines = result.stdout.split('\n')

  // Remove the trailing newline
  lines.splice(-1, 1)

  if (lines.length === 0) {
    return []
  }

  const localBranches = []
  const remoteBranchShas = new Map<string, string>()

  // First we need to collect the relevant info from the command output:
  // - For local branches with upstream: name, ref, SHA and the upstream.
  // - For remote branches we only need the sha (and the ref as key).
  for (const line of lines) {
    const [ref, sha, upstream, symref, head] = line.split('\0')

    if (symref.length > 0 || head === '*') {
      // Exclude symbolic refs and the current branch
      continue
    }

    if (ref.startsWith('refs/heads')) {
      if (upstream.length === 0) {
        // Exclude local branches without upstream
        continue
      }

      localBranches.push({ ref, sha, upstream })
    } else {
      remoteBranchShas.set(ref, sha)
    }
  }

  const eligibleBranches = new Array<ITrackingBranch>()

  // Compare the SHA of every local branch with the SHA of its upstream and
  // collect the names of local branches that differ from their upstream.
  for (const branch of localBranches) {
    const remoteSha = remoteBranchShas.get(branch.upstream)

    if (remoteSha !== undefined && remoteSha !== branch.sha) {
      eligibleBranches.push({
        ref: branch.ref,
        sha: branch.sha,
        upstreamRef: branch.upstream,
        upstreamSha: remoteSha,
      })
    }
  }

  return eligibleBranches
}
