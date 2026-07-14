import { git } from './core'
import {
  CommittedFileChange,
  AppFileStatusKind,
  PlainFileStatus,
  CopiedOrRenamedFileStatus,
  UntrackedFileStatus,
  AppFileStatus,
  SubmoduleStatus,
} from '../../models/status'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { CommitIdentity } from '../../models/commit-identity'
import { parseRawUnfoldedTrailers } from './interpret-trailers'
import { createLogParser } from './git-delimiter-parser'
import { forceUnwrap } from '../fatal-error'
import assert from 'assert'

// File mode 160000 is used by git specifically for submodules:
// https://github.com/git/git/blob/v2.37.3/cache.h#L62-L69
const SubmoduleFileMode = '160000'

function mapSubmoduleStatusFileModes(
  status: string,
  srcMode: string,
  dstMode: string
): SubmoduleStatus | undefined {
  return srcMode === SubmoduleFileMode &&
    dstMode === SubmoduleFileMode &&
    status === 'M'
    ? {
        commitChanged: true,
        untrackedChanges: false,
        modifiedChanges: false,
      }
    : (srcMode === SubmoduleFileMode && status === 'D') ||
      (dstMode === SubmoduleFileMode && status === 'A')
    ? {
        commitChanged: false,
        untrackedChanges: false,
        modifiedChanges: false,
      }
    : undefined
}

/**
 * Map the raw status text from Git to an app-friendly value
 * shamelessly borrowed from GitHub Desktop (Windows)
 */
function mapStatus(
  rawStatus: string,
  oldPath: string | undefined,
  srcMode: string,
  dstMode: string
): PlainFileStatus | CopiedOrRenamedFileStatus | UntrackedFileStatus {
  const status = rawStatus.trim()
  const submoduleStatus = mapSubmoduleStatusFileModes(status, srcMode, dstMode)

  if (status === 'M') {
    return { kind: AppFileStatusKind.Modified, submoduleStatus }
  } // modified
  if (status === 'A') {
    return { kind: AppFileStatusKind.New, submoduleStatus }
  } // added
  if (status === '?') {
    return { kind: AppFileStatusKind.Untracked, submoduleStatus }
  } // untracked
  if (status === 'D') {
    return { kind: AppFileStatusKind.Deleted, submoduleStatus }
  } // deleted
  if (status === 'R' && oldPath != null) {
    return {
      kind: AppFileStatusKind.Renamed,
      oldPath,
      submoduleStatus,
      renameIncludesModifications: false,
    }
  } // renamed
  if (status === 'C' && oldPath != null) {
    return {
      kind: AppFileStatusKind.Copied,
      oldPath,
      submoduleStatus,
      renameIncludesModifications: false,
    }
  } // copied

  // git log -M --name-status will return a RXXX - where XXX is a percentage
  if (status.match(/R[0-9]+/) && oldPath != null) {
    return {
      kind: AppFileStatusKind.Renamed,
      oldPath,
      submoduleStatus,
      renameIncludesModifications: status !== 'R100',
    }
  }

  // git log -C --name-status will return a CXXX - where XXX is a percentage
  if (status.match(/C[0-9]+/) && oldPath != null) {
    return {
      kind: AppFileStatusKind.Copied,
      oldPath,
      submoduleStatus,
      renameIncludesModifications: false,
    }
  }

  return { kind: AppFileStatusKind.Modified, submoduleStatus }
}

const isCopyOrRename = (
  status: AppFileStatus
): status is CopiedOrRenamedFileStatus =>
  status.kind === AppFileStatusKind.Copied ||
  status.kind === AppFileStatusKind.Renamed

/**
 * Get the repository's commits using `revisionRange` and limited to `limit`
 */
export async function getCommits(
  repository: Repository,
  revisionRange?: string,
  limit?: number,
  skip?: number,
  additionalArgs: ReadonlyArray<string> = []
): Promise<ReadonlyArray<Commit>> {
  const { formatArgs, parse } = createLogParser({
    sha: '%H', // SHA
    shortSha: '%h', // short SHA
    summary: '%s', // summary
    body: '%b', // body
    // author identity string, matching format of GIT_AUTHOR_IDENT.
    //   author name <author email> <author date>
    // author date format dependent on --date arg, should be raw
    author: '%an <%ae> %ad',
    committer: '%cn <%ce> %cd',
    parents: '%P', // parent SHAs,
    trailers: '%(trailers:unfold,only)',
    refs: '%D',
  })

  const args = ['log']

  if (revisionRange !== undefined) {
    args.push(revisionRange)
  }

  args.push('--date=raw')

  if (limit !== undefined) {
    args.push(`--max-count=${limit}`)
  }

  if (skip !== undefined) {
    args.push(`--skip=${skip}`)
  }

  args.push(
    ...formatArgs,
    '--no-show-signature',
    '--no-color',
    ...additionalArgs,
    '--'
  )
  const result = await git(args, repository.path, 'getCommits', {
    successExitCodes: new Set([0, 128]),
    encoding: 'buffer',
  })

  // if the repository has an unborn HEAD, return an empty history of commits
  if (result.exitCode === 128) {
    return new Array<Commit>()
  }

  const parsed = parse(result.stdout)

  return parsed.map(commit => {
    // Ref is of the format: (HEAD -> master, tag: some-tag-name, tag: some-other-tag,with-a-comma, origin/master, origin/HEAD)
    // Refs are comma separated, but some like tags can also contain commas in the name, so we split on the pattern ", " and then
    // check each ref for the tag prefix. We used to use the regex /tag: ([^\s,]+)/g)`, but will clip a tag with a comma short.
    const tags = commit.refs
      .toString()
      .split(', ')
      .flatMap(ref => (ref.startsWith('tag: ') ? ref.substring(5) : []))

    return new Commit(
      commit.sha.toString(),
      commit.shortSha.toString(),
      commit.summary.subarray(0, 100 * 1024).toString(),
      commit.body.subarray(0, 100 * 1024).toString(),
      CommitIdentity.parseIdentity(commit.author.toString()),
      CommitIdentity.parseIdentity(commit.committer.toString()),
      commit.parents.length > 0 ? commit.parents.toString().split(' ') : [],
      // We know for sure that the trailer separator will be ':' since we got
      // them from %(trailers:unfold) above, see `git help log`:
      //
      //   "key_value_separator=<SEP>: specify a separator inserted between
      //    trailer lines. When this option is not given each trailer key-value
      //    pair is separated by ": ". Otherwise it shares the same semantics as
      //    separator=<SEP> above."
      parseRawUnfoldedTrailers(commit.trailers.toString(), ':'),
      tags
    )
  })
}

/** This interface contains information of a changeset. */
export interface IChangesetData {
  /** Files changed in the changeset. */
  readonly files: ReadonlyArray<CommittedFileChange>

  /** Number of lines added in the changeset. */
  readonly linesAdded: number

  /** Number of lines deleted in the changeset. */
  readonly linesDeleted: number
}

/** Get the files that were changed in the given commit. */
export async function getChangedFiles(
  repository: Repository,
  sha: string
): Promise<IChangesetData> {
  // opt-in for rename detection (-M) and copies detection (-C)
  // this is equivalent to the user configuring 'diff.renames' to 'copies'
  // NOTE: order here matters - doing -M before -C means copies aren't detected
  const args = [
    'log',
    sha,
    '-C',
    '-M',
    '-m',
    '-1',
    '--no-show-signature',
    '--first-parent',
    '--raw',
    '--format=format:',
    '--numstat',
    '-z',
    '--',
  ]

  const { stdout } = await git(args, repository.path, 'getChangesFiles')
  return parseRawLogWithNumstat(stdout, sha, `${sha}^`)
}

/**
 * Parses output of diff flags -z --raw --numstat.
 *
 * Given the -z flag the new lines are separated by \0 character (left them as
 * new lines below for ease of reading)
 *
 * For modified, added, deleted, untracked:
 *    100644 100644 5716ca5 db3c77d M
 *    file_one_path
 *    :100644 100644 0835e4f 28096ea M
 *    file_two_path
 *    1    0       file_one_path
 *    1    0       file_two_path
 *
 * For copied or renamed:
 *    100644 100644 5716ca5 db3c77d M
 *    file_one_original_path
 *    file_one_new_path
 *    :100644 100644 0835e4f 28096ea M
 *    file_two_original_path
 *    file_two_new_path
 *    1    0
 *    file_one_original_path
 *    file_one_new_path
 *    1    0
 *    file_two_original_path
 *    file_two_new_path
 */

export function parseRawLogWithNumstat(
  stdout: string,
  sha: string,
  parentCommitish: string
) {
  const files = new Array<CommittedFileChange>()
  let linesAdded = 0
  let linesDeleted = 0
  let numStatCount = 0
  const lines = stdout.split('\0')

  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    if (line.startsWith(':')) {
      const lineComponents = line.split(' ')
      const srcMode = forceUnwrap(
        'Invalid log output (srcMode)',
        lineComponents[0]?.replace(':', '')
      )
      const dstMode = forceUnwrap(
        'Invalid log output (dstMode)',
        lineComponents[1]
      )
      const status = forceUnwrap(
        'Invalid log output (status)',
        lineComponents.at(-1)
      )
      const oldPath = /^R|C/.test(status)
        ? forceUnwrap('Missing old path', lines.at(++i))
        : undefined

      const path = forceUnwrap('Missing path', lines.at(++i))

      files.push(
        new CommittedFileChange(
          path,
          mapStatus(status, oldPath, srcMode, dstMode),
          sha,
          parentCommitish
        )
      )
    } else {
      const match = /^(\d+|-)\t(\d+|-)\t/.exec(line)
      const [, added, deleted] = forceUnwrap('Invalid numstat line', match)
      linesAdded += added === '-' ? 0 : parseInt(added, 10)
      linesDeleted += deleted === '-' ? 0 : parseInt(deleted, 10)

      // If this entry denotes a rename or copy the old and new paths are on
      // two separate fields (separated by \0). Otherwise they're on the same
      // line as the added and deleted lines.
      if (isCopyOrRename(files[numStatCount].status)) {
        i += 2
      }
      numStatCount++
    }
  }

  return { files, linesAdded, linesDeleted }
}

/** Get the commit for the given ref. */
export async function getCommit(
  repository: Repository,
  ref: string
): Promise<Commit | null> {
  const commits = await getCommits(repository, ref, 1)
  if (commits.length < 1) {
    return null
  }

  return commits[0]
}

/** Get the author identity for the given shas */
export async function getAuthors(repository: Repository, shas: string[]) {
  if (shas.length === 0) {
    return []
  }

  const { stdout } = await git(
    [
      'log',
      '--format=format:%an <%ae> %ad',
      '--no-walk=unsorted',
      '--date=raw',
      '-z',
      '--stdin',
    ],
    repository.path,
    'getAuthors',
    { stdin: shas.join('\n') }
  )

  const authors = stdout.split('\0').map(CommitIdentity.parseIdentity)

  // This can happen if there are duplicate shas in the input, git log will only
  // return the author once for each sha.
  assert.equal(authors.length, shas.length, 'Commit to author mismatch')

  return authors
}
