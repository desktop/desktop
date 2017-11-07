import { git } from './core'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Branch, BranchType } from '../../models/branch'
import { CommitIdentity } from '../../models/commit-identity'

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
    '%(author)',
    '%(parent)', // parent SHAs
    '%(symref)',
    '%(subject)',
    '%(body)',
    `%${delimiter}`, // indicate end-of-line as %(body) may contain newlines
  ].join('%00')

  if (!prefixes || !prefixes.length) {
    prefixes = ['refs/heads', 'refs/remotes']
  }

  const result = await git(
    ['for-each-ref', `--format=${format}`, ...prefixes],
    repository.path,
    'getBranches'
  )
  const names = result.stdout
  const lines = names.split(delimiterString)

  // Remove the trailing newline
  lines.splice(-1, 1)

  const branches = []

  for (const [ix, line] of lines.entries()) {
    // preceding newline character after first row
    const pieces = (ix > 0 ? line.substr(1) : line).split('\0')

    const ref = pieces[0]
    const name = pieces[1]
    const upstream = pieces[2]
    const sha = pieces[3]

    const authorIdentity = pieces[4]
    const author = CommitIdentity.parseIdentity(authorIdentity)

    if (!author) {
      throw new Error(`Couldn't parse author identity ${authorIdentity}`)
    }

    const parentSHAs = pieces[5].split(' ')
    const symref = pieces[6]
    const summary = pieces[7]
    const body = pieces[8]

    const tip = new Commit(sha, summary, body, author, parentSHAs)

    const type = ref.startsWith('refs/head')
      ? BranchType.Local
      : BranchType.Remote

    if (symref.length > 0) {
      // excude symbolic refs from the branch list
      continue
    }

    branches.push(
      new Branch(name, upstream.length > 0 ? upstream : null, tip, type)
    )
  }

  return branches
}
