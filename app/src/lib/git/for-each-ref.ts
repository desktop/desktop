import { git } from './core'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Branch, BranchType } from '../../models/branch'

/** Get all the branches. */
export async function getBranches(repository: Repository, prefix: string, type: BranchType): Promise<ReadonlyArray<Branch>> {

  const delimiter = '1F'
  const delimiterString = String.fromCharCode(parseInt(delimiter, 16))

  const format = [
    '%(refname:short)',
    '%(upstream:short)',
    '%(objectname)', // SHA
    '%(authorname)',
    '%(authoremail)',
    '%(authordate)',
    '%(parent)', // parent SHAs
    '%(subject)',
    '%(body)',
    `%${delimiter}`, // indicate end-of-line as %(body) may contain newlines
  ].join('%00')
  const result = await git([ 'for-each-ref', `--format=${format}`, prefix ], repository.path, 'getBranches')
  const names = result.stdout
  const lines = names.split(delimiterString)

  // Remove the trailing newline
  lines.splice(-1, 1)

  const branches = lines.map(line => {
    const pieces = line.split('\0')

    // preceding newline character after first row
    const name = pieces[0].trim()
    const upstream = pieces[1]
    const sha = pieces[2]
    const authorName = pieces[3]

    // author email is wrapped in arrows e.g. <hubot@github.com>
    const authorEmailRaw = pieces[4]
    const authorEmail = authorEmailRaw.substring(1, authorEmailRaw.length - 1)
    const authorDateText = pieces[5]
    const authorDate = new Date(authorDateText)

    const parentSHAs = pieces[6].split(' ')

    const summary = pieces[7]

    const body = pieces[8]

    const tip = new Commit(sha, summary, body, authorName, authorEmail, authorDate, parentSHAs)

    return new Branch(name, upstream.length > 0 ? upstream : null, tip, type)
  })

  return branches
}

/** Get the name of the current branch. */
export async function getCurrentBranch(repository: Repository): Promise<Branch | null> {
  const revParseResult = await git([ 'rev-parse', '--abbrev-ref', 'HEAD' ], repository.path, 'getCurrentBranch', { successExitCodes: new Set([ 0, 1, 128 ]) })
  // error code 1 is returned if no upstream
  // error code 128 is returned if the branch is unborn
  if (revParseResult.exitCode === 1 || revParseResult.exitCode === 128) {
    return null
  }

  const untrimmedName = revParseResult.stdout
  let name = untrimmedName.trim()
  // New branches have a `heads/` prefix.
  name = name.replace(/^heads\//, '')

  const branches = await getBranches(repository, `refs/heads/${name}`, BranchType.Local)

  return branches[0]
}
