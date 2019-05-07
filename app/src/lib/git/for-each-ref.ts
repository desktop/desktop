import { git } from './core'
import { GitError } from 'dugite'

import { Repository } from '../../models/repository'
//import { Commit } from '../../models/commit'
import { Branch, BranchType } from '../../models/branch'
import { CommitIdentity } from '../../models/commit-identity'
import { ForkedRemotePrefix } from '../../models/remote'
// import {
//   getTrailerSeparatorCharacters,
//   parseRawUnfoldedTrailers,
// } from './interpret-trailers'

const ForksReferencesPrefix = `refs/remotes/${ForkedRemotePrefix}`

/** Get all the branches. */
export async function getBranches(
  repository: Repository,
  ...prefixes: string[]
): Promise<ReadonlyArray<Branch>> {
  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))

  const format = [
    '%(refname)',
    '%(refname:short)',
    '%(upstream:short)',
    '%(objectname)', // SHA
    '%(objectname:short)', // short SHA
    '%(author)',
    '%(symref)',
    `%${delimiter}`, // indicate end-of-line as %(body) may contain newlines
  ].join('%00')

  if (!prefixes || !prefixes.length) {
    prefixes = ['refs/heads', 'refs/remotes']
  }

  // TODO: use expectedErrors here to handle a specific error
  // see https://github.com/desktop/desktop/pull/5299#discussion_r206603442 for
  // discussion about what needs to change
  const result = await git(
    ['for-each-ref', `--format=${format}`, ...prefixes],
    repository.path,
    'getBranches',
    { expectedErrors: new Set([GitError.NotAGitRepository]) }
  )

  if (result.gitError === GitError.NotAGitRepository) {
    return []
  }

  const names = result.stdout
  const lines = names.split(delimiterString)

  // Remove the trailing newline
  lines.splice(-1, 1)

  if (lines.length === 0) {
    return []
  }

  const branches = []

  for (const [ix, line] of lines.entries()) {
    // preceding newline character after first row
    const pieces = (ix > 0 ? line.substr(1) : line).split('\0')

    const ref = pieces[0]
    const name = pieces[1]
    const upstream = pieces[2]
    const sha = pieces[3]
    const shortSha = pieces[4]

    const authorIdentity = pieces[5]
    const author = CommitIdentity.parseIdentity(authorIdentity)

    if (!author) {
      throw new Error(`Couldn't parse author identity ${authorIdentity}`)
    }

    const symref = pieces[6]
    if (symref.length > 0) {
      // excude symbolic refs from the branch list
      continue
    }

    if (ref.startsWith(ForksReferencesPrefix)) {
      // hide refs from our known remotes as these are considered plumbing
      // and can add noise to everywhere in the user interface where we
      // display branches as forks will likely contain duplicates of the same
      // ref names
      continue
    }

    const type = ref.startsWith('refs/head')
      ? BranchType.Local
      : BranchType.Remote

    branches.push(
      new Branch(
        name,
        upstream.length > 0 ? upstream : null,
        sha,
        shortSha,
        author.date,
        type
      )
    )
  }

  return branches
}
