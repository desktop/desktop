import { GitProcess, GitError } from 'git-kitchen-sink'

import { git, GitError as InternalGitError } from './git/core'
import { getWorkingDirectoryDiff } from './git/git-diff'

import { WorkingDirectoryFileChange, FileStatus } from '../models/status'
import { Repository } from '../models/repository'

import { formatPatch } from './patch-formatter'

import { isHeadUnborn } from './git/repository'
import { stageFiles } from './git/add'

import { Commit } from '../models/commit'
import { Branch, BranchType } from '../models/branch'

/* tslint:disable:no-stateless-class */

/** The number of commits a revision range is ahead/behind. */
export interface IAheadBehind {
  readonly ahead: number
  readonly behind: number
}

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {

  public static async applyPatchToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {

    // If the file was a rename we have to recreate that rename since we've
    // just blown away the index. Think of this block of weird looking commands
    // as running `git mv`.
    if (file.status === FileStatus.Renamed && file.oldPath) {
      // Make sure the index knows of the removed file. We could use
      // update-index --force-remove here but we're not since it's theoretically
      // possible that someone staged a rename and then recreated the
      // original file and we don't have any guarantees for in which order
      // partial stages vs full-file stages happen. By using git add the
      // worst that could happen is that we re-stage a file already staged
      // by addFileToIndex
      await git([ 'add', '--u', '--', file.oldPath ], repository.path)

      // Figure out the blob oid of the removed file
      // <mode> SP <type> SP <object> TAB <file>
      const oldFile = await git([ 'ls-tree', 'HEAD', '--', file.oldPath ], repository.path)

      const [ info ] = oldFile.stdout.split('\t', 1)
      const [ mode, , oid ] = info.split(' ', 3)

      // Add the old file blob to the index under the new name
      await git([ 'update-index', '--add', '--cacheinfo', mode, oid, file.path ], repository.path)
    }

    const applyArgs: string[] = [ 'apply', '--cached', '--unidiff-zero', '--whitespace=nowarn', '-' ]

    const diff = await getWorkingDirectoryDiff(repository, file)

    const patch = await formatPatch(file, diff)
    await git(applyArgs, repository.path, { stdin: patch })

    return Promise.resolve()
  }

  public static async createCommit(repository: Repository, message: string, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    // Clear the staging area, our diffs reflect the difference between the
    // working directory and the last commit (if any) so our commits should
    // do the same thing.
    if (await isHeadUnborn(repository)) {
      await git([ 'reset' ], repository.path)
    } else {
      await git([ 'reset', 'HEAD', '--mixed' ], repository.path)
    }

    await stageFiles(repository, files)

    await git([ 'commit', '-F',  '-' ] , repository.path, { stdin: message })
  }

  /** Get the name of the current branch. */
  public static async getCurrentBranch(repository: Repository): Promise<Branch | null> {
    const revParseResult = await git([ 'rev-parse', '--abbrev-ref', 'HEAD' ], repository.path, { successExitCodes: new Set([ 0, 1, 128 ]) })
    // error code 1 is returned if no upstream
    // error code 128 is returned if the branch is unborn
    if (revParseResult.exitCode === 1 || revParseResult.exitCode === 128) {
      return null
    }

    const untrimmedName = revParseResult.stdout
    let name = untrimmedName.trim()
    // New branches have a `heads/` prefix.
    name = name.replace(/^heads\//, '')

    const branches = await LocalGitOperations.getBranches(repository, `refs/heads/${name}`, BranchType.Local)

    return branches[0]
  }

  /** Get the number of commits in HEAD. */
  public static async getCommitCount(repository: Repository): Promise<number> {
    const result = await git([ 'rev-list', '--count', 'HEAD' ], repository.path, { successExitCodes: new Set([ 0, 128 ]) })
    // error code 128 is returned if the branch is unborn
    if (result.exitCode === 128) {
      return 0
    } else {
      const count = result.stdout
      return parseInt(count.trim(), 10)
    }
  }

  /** Get all the branches. */
  public static async getBranches(repository: Repository, prefix: string, type: BranchType): Promise<ReadonlyArray<Branch>> {

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
    const result = await git([ 'for-each-ref', `--format=${format}`, prefix ], repository.path)
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

  /** Create a new branch from the given start point. */
  public static createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    return git([ 'branch', name, startPoint ], repository.path)
  }

  /** Check out the given branch. */
  public static checkoutBranch(repository: Repository, name: string): Promise<void> {
    return git([ 'checkout', name, '--' ], repository.path)
  }

  /** Rename the given branch to a new name. */
  public static renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    return git([ 'branch', '-m', branch.nameWithoutRemote, newName ], repository.path)
  }

  /**
   * Delete the branch. If the branch has a remote branch, it too will be
   * deleted.
   */
  public static async deleteBranch(repository: Repository, branch: Branch): Promise<true> {
    if (branch.type === BranchType.Local) {
      await git([ 'branch', '-D', branch.name ], repository.path)
    }

    const remote = branch.remote
    if (remote) {
      await git([ 'push', remote, `:${branch.nameWithoutRemote}` ], repository.path)
    }

    return true
  }

  /** Check out the paths at HEAD. */
  public static checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
    return git([ 'checkout', '--', ...paths ], repository.path)
  }

  /** Calculate the number of commits `branch` is ahead/behind its upstream. */
  public static async getBranchAheadBehind(repository: Repository, branch: Branch): Promise<IAheadBehind | null> {
    if (branch.type === BranchType.Remote) {
      return null
    }

    const upstream = branch.upstream
    if (!upstream) { return null }

    // NB: The three dot form means we'll go all the way back to the merge base
    // of the branch and its upstream. Practically this is important for seeing
    // "through" merges.
    const range = `${branch.name}...${upstream}`
    return this.getAheadBehind(repository, range)
  }

  /** Calculate the number of commits the range is ahead and behind. */
  private static async getAheadBehind(repository: Repository, range: string): Promise<IAheadBehind | null> {
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
}
