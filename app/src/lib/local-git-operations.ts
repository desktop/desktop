import { GitProcess, GitError } from 'git-kitchen-sink'

import { git, GitError as InternalGitError } from './git/core'
import { getWorkingDirectoryDiff } from './git/git-diff'

import { WorkingDirectoryFileChange, FileStatus } from '../models/status'
import { DiffSelectionType } from '../models/diff'
import { Repository } from '../models/repository'

import { formatPatch } from './patch-formatter'

import { assertNever } from './fatal-error'
import { isHeadUnborn } from './git/repository'

import { Commit } from '../models/commit'

/* tslint:disable:no-stateless-class */

export enum BranchType {
  Local,
  Remote,
}

/** A branch as loaded from Git. */
export class Branch {
  /** The short name of the branch. E.g., `master`. */
  public readonly name: string

  /** The remote-prefixed upstream name. E.g., `origin/master`. */
  public readonly upstream: string | null

  /** The type of branch, e.g., local or remote. */
  public readonly type: BranchType

  /** The commit associated with this branch */
  public readonly tip: Commit

  public constructor(name: string, upstream: string | null, tip: Commit, type: BranchType) {
    this.name = name
    this.upstream = upstream
    this.tip = tip
    this.type = type
  }

  /** The name of the upstream's remote. */
  public get remote(): string | null {
    const upstream = this.upstream
    if (!upstream) { return null }

    const pieces = upstream.match(/(.*?)\/.*/)
    if (!pieces || pieces.length < 2) { return null }

    return pieces[1]
  }

  /**
   * The name of the branch without the remote prefix. If the branch is a local
   * branch, this is the same as its `name`.
   */
  public get nameWithoutRemote(): string {
    if (this.type === BranchType.Local) {
      return this.name
    } else {
      const pieces = this.name.match(/.*?\/(.*)/)
      if (!pieces || pieces.length < 2) {
         return this.name
      }

      return pieces[1]
    }
  }
}

/** The reset modes which are supported. */
export const enum GitResetMode {
  Hard = 0,
  Soft,
  Mixed,
}

/** The number of commits a revision range is ahead/behind. */
export interface IAheadBehind {
  readonly ahead: number
  readonly behind: number
}

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {



  private static async addFileToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {

    if (file.status === FileStatus.New) {
      await git([ 'add', '--', file.path ], repository.path)
    } else if (file.status === FileStatus.Renamed && file.oldPath) {
      await git([ 'add', '--', file.path ], repository.path)
      await git([ 'add', '-u', '--', file.oldPath ], repository.path)
    } else {
      await git([ 'add', '-u', '--', file.path ], repository.path)
    }
  }

  private static async applyPatchToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {

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

    await this.stageFiles(repository, files)

    await git([ 'commit', '-F',  '-' ] , repository.path, { stdin: message })
  }

  /**
   * Stage all the given files by either staging the entire path or by applying
   * a patch.
   */
  private static async stageFiles(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
    for (const file of files) {
      if (file.selection.getSelectionType() === DiffSelectionType.All) {
        await this.addFileToIndex(repository, file)
      } else {
        await this.applyPatchToIndex(repository, file)
      }
    }
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

  /** Get the `limit` most recently checked out branches. */
  public static async getRecentBranches(repository: Repository, branches: ReadonlyArray<Branch>, limit: number): Promise<ReadonlyArray<Branch>> {
    const branchesByName = branches.reduce((map, branch) => map.set(branch.name, branch), new Map<string, Branch>())

    // "git reflog show" is just an alias for "git log -g --abbrev-commit --pretty=oneline"
    // but by using log we can give it a max number which should prevent us from balling out
    // of control when there's ginormous reflogs around (as in e.g. github/github).
    const regex = new RegExp(/.*? checkout: moving from .*? to (.*?)$/i)
    const result = await git([ 'log', '-g', '--abbrev-commit', '--pretty=oneline', 'HEAD', '-n', '2500', '--' ], repository.path, { successExitCodes: new Set([ 0, 128 ]) })

    if (result.exitCode === 128) {
      // error code 128 is returned if the branch is unborn
      return new Array<Branch>()
    }

    const output = result.stdout
    const lines = output.split('\n')
    const names = new Set<string>()
    for (const line of lines) {
      const result = regex.exec(line)
      if (result && result.length === 2) {
        const branchName = result[1]
        names.add(branchName)
      }

      if (names.size === limit) {
        break
      }
    }

    const recentBranches = new Array<Branch>()
    for (const name of names) {
      const branch = branchesByName.get(name)
      if (!branch) {
        // This means the recent branch has been deleted. That's fine.
        continue
      }

      recentBranches.push(branch)
    }

    return recentBranches
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

  /** Add a new remote with the given URL. */
  public static addRemote(path: string, name: string, url: string): Promise<void> {
    return git([ 'remote', 'add', name, url ], path)
  }

  /** Check out the paths at HEAD. */
  public static checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
    return git([ 'checkout', '--', ...paths ], repository.path)
  }

  /** Reset with the mode to the ref. */
  public static async reset(repository: Repository, mode: GitResetMode, ref: string): Promise<true> {
    const modeFlag = resetModeToFlag(mode)
    await git([ 'reset', modeFlag, ref, '--' ], repository.path)
    return true
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

  /**
   * Update the ref to a new value.
   *
   * @param repository - The repository in which the ref exists.
   * @param ref        - The ref to update. Must be fully qualified
   *                     (e.g., `refs/heads/NAME`).
   * @param oldValue   - The value we expect the ref to have currently. If it
   *                     doesn't match, the update will be aborted.
   * @param newValue   - The new value for the ref.
   * @param reason     - The reflog entry.
   */
  public static async updateRef(repository: Repository, ref: string, oldValue: string, newValue: string, reason: string): Promise<void> {
    await git([ 'update-ref', ref, newValue, oldValue, '-m', reason ], repository.path)
  }
}

function resetModeToFlag(mode: GitResetMode): string {
  switch (mode) {
    case GitResetMode.Hard: return '--hard'
    case GitResetMode.Mixed: return '--mixed'
    case GitResetMode.Soft: return '--soft'
    default: return assertNever(mode, `Unknown reset mode: ${mode}`)
  }
}
