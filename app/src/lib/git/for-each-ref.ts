import { git } from './core'
import { GitError } from 'dugite'
import { Repository } from '../../models/repository'
import { Branch, BranchType, IBranchTip } from '../../models/branch'
import { CommitIdentity } from '../../models/commit-identity'
import { NullDelimiterParser } from './null-delimiter-parser'

/** Get all the branches. */
export async function getBranches(
  repository: Repository,
  ...prefixes: string[]
): Promise<ReadonlyArray<Branch>> {
  const parser = new NullDelimiterParser(
    {
      fullName: '%(refname)',
      shortName: '%(refname:short)',
      upstreamShortName: '%(upstream:short)',
      sha: '%(objectname)',
      shortSha: '%(objectname:short)',
      author: '%(author)',
      committer: '%(committer)',
      parent: '%(parent)',
      symRef: '%(symref)',
      subject: '%(subject)',
      body: '%(body)',
      trailers: '%(trailers:unfold,only)',
    },
    '%00'
  )

  if (!prefixes || !prefixes.length) {
    prefixes = ['refs/heads', 'refs/remotes']
  }

  // TODO: use expectedErrors here to handle a specific error
  // see https://github.com/desktop/desktop/pull/5299#discussion_r206603442 for
  // discussion about what needs to change
  const result = await git(
    ['for-each-ref', `--format=${parser.format}`, ...prefixes],
    repository.path,
    'getBranches',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const branches = []

  for (const ref of parser.parse(result.stdout)) {
    // excude symbolic refs from the branch list
    if (ref.symRef.length > 0) {
      continue
    }

    const author = CommitIdentity.parseIdentity(ref.author)

    if (!author) {
      throw new Error(`Couldn't parse author identity ${ref.author}`)
    }

    const committer = CommitIdentity.parseIdentity(ref.committer)

    if (!committer) {
      throw new Error(`Couldn't parse committer identity ${ref.committer}`)
    }

    const tip: IBranchTip = { sha: ref.sha, author }

    const type = ref.fullName.startsWith('refs/head')
      ? BranchType.Local
      : BranchType.Remote

    branches.push(
      new Branch(
        ref.shortName,
        ref.upstreamShortName.length > 0 ? ref.upstreamShortName : null,
        tip,
        type
      )
    )
  }

  return branches
}
