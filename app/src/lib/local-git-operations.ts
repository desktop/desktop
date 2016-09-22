import * as Path from 'path'
import * as ChildProcess from 'child_process'

import { WorkingDirectoryStatus, WorkingDirectoryFileChange, FileChange, FileStatus } from '../models/status'
import { DiffSelectionType, DiffSelection, Diff } from '../models/diff'
import Repository from '../models/repository'

import { createPatchForModifiedFile, createPatchForNewFile, createPatchForDeletedFile } from './patch-formatter'
import { parseRawDiff } from './diff-parser'

import { GitProcess, GitError, GitErrorCode } from 'git-kitchen-sink'

import User from '../models/user'

const byline = require('byline')

/** The encapsulation of the result from 'git status' */
export class StatusResult {
  /** true if the repository exists at the given location */
  public readonly exists: boolean

  /** the absolute path to the repository's working directory */
  public readonly workingDirectory: WorkingDirectoryStatus

  /** factory method when 'git status' is unsuccessful */
  public static NotFound(): StatusResult {
    return new StatusResult(false, new WorkingDirectoryStatus(new Array<WorkingDirectoryFileChange>(), true))
  }

  /** factory method for a successful 'git status' result  */
  public static FromStatus(status: WorkingDirectoryStatus): StatusResult {
    return new StatusResult(true, status)
  }

  public constructor(exists: boolean, workingDirectory: WorkingDirectoryStatus) {
    this.exists = exists
    this.workingDirectory = workingDirectory
  }
}

/** A git commit. */
export class Commit {
  /** The commit's SHA. */
  public readonly sha: string

  /** The first line of the commit message. */
  public readonly summary: string

  /** The commit message without the first line and CR. */
  public readonly body: string
  public readonly authorName: string
  public readonly authorEmail: string
  public readonly authorDate: Date

  public constructor(sha: string, summary: string, body: string, authorName: string, authorEmail: string, authorDate: Date) {
    this.sha = sha
    this.summary = summary
    this.body = body
    this.authorName = authorName
    this.authorEmail = authorEmail
    this.authorDate = authorDate
  }
}

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

  /** The SHA for the tip of the branch. */
  public readonly sha: string

  /** The type of branch, e.g., local or remote. */
  public readonly type: BranchType

  public constructor(name: string, upstream: string | null, sha: string, type: BranchType) {
    this.name = name
    this.upstream = upstream
    this.sha = sha
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

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {

  /**
   * map the raw status text from Git to an app-friendly value
   * shamelessly borrowed from GitHub Desktop (Windows)
   */
  private static mapStatus(rawStatus: string): FileStatus {

    const status = rawStatus.trim()

    if (status === 'M') { return FileStatus.Modified }      // modified
    if (status === 'A') { return FileStatus.New }           // added
    if (status === 'D') { return FileStatus.Deleted }       // deleted
    if (status === 'R') { return FileStatus.Renamed }       // renamed
    if (status === 'RM') { return FileStatus.Renamed }      // renamed in index, modified in working directory
    if (status === 'RD') { return FileStatus.Conflicted }   // renamed in index, deleted in working directory
    if (status === 'DD') { return FileStatus.Conflicted }   // Unmerged, both deleted
    if (status === 'AU') { return FileStatus.Conflicted }   // Unmerged, added by us
    if (status === 'UD') { return FileStatus.Conflicted }   // Unmerged, deleted by them
    if (status === 'UA') { return FileStatus.Conflicted }   // Unmerged, added by them
    if (status === 'DU') { return FileStatus.Conflicted }   // Unmerged, deleted by us
    if (status === 'AA') { return FileStatus.Conflicted }   // Unmerged, added by both
    if (status === 'UU') { return FileStatus.Conflicted }   // Unmerged, both modified
    if (status === '??') { return FileStatus.New }          // untracked

    return FileStatus.Modified
  }

  /**
   *  Retrieve the status for a given repository,
   *  and fail gracefully if the location is not a Git repository
   */
  public static getStatus(repository: Repository): Promise<StatusResult> {
    return GitProcess.execWithOutput([ 'status', '--untracked-files=all', '--porcelain' ], repository.path)
        .then(output => {
            const lines = output.split('\n')

            const regex = /([\? \w]{2}) (.*)/
            const regexGroups = { mode: 1, path: 2 }

            const files = new Array<WorkingDirectoryFileChange>()

            for (const index in lines) {
              const line = lines[index]
              const result = regex.exec(line)

              if (result) {
                const modeText = result[regexGroups.mode]
                const path = result[regexGroups.path]

                const status = this.mapStatus(modeText)
                const diffSelection = new DiffSelection(DiffSelectionType.All, new Map<number, boolean>())
                files.push(new WorkingDirectoryFileChange(path, status, diffSelection))
              }
            }

            return StatusResult.FromStatus(new WorkingDirectoryStatus(files, true))
        })
        .catch(error => {
          if (error) {
            const gitError = error as GitError
            if (gitError) {
              const code = gitError.errorCode
              if (code === GitErrorCode.NotFound) {
                return StatusResult.NotFound()
              }
              throw new Error('unable to resolve HEAD, got error code: ' + code)
            }
          }

          throw new Error('unable to resolve status, got unknown error: ' + error)
        })
  }

  private static async resolveHEAD(repository: Repository): Promise<boolean> {
    return GitProcess.execWithOutput([ 'show', 'HEAD' ], repository.path)
      .then(output => {
        return Promise.resolve(true)
      })
      .catch(error => {
        if (error) {

          const gitError = error as GitError
          if (gitError) {
              const code = gitError.errorCode
              if (code === GitErrorCode.NotFound) {
                return Promise.resolve(false)
              }
              throw new Error('unable to resolve HEAD, got error code: ' + code)
            }
         }

        throw new Error('unable to resolve HEAD, got unknown error: ' + error)
      })
  }

  private static addFileToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {
    let addFileArgs: string[] = []

    if (file.status === FileStatus.New) {
      addFileArgs = [ 'add', file.path ]
    } else {
      addFileArgs = [ 'add', '-u', file.path ]
    }

    return GitProcess.exec(addFileArgs, repository.path)
  }

  private static async applyPatchToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {
    const applyArgs: string[] = [ 'apply', '--cached', '--unidiff-zero', '--whitespace=nowarn', '-' ]

    const diff = await LocalGitOperations.getDiff(repository, file, null)

    const write = (input: string) => {
      return (process: ChildProcess.ChildProcess) => {
        process.stdin.write(input)
        process.stdin.end()
      }
    }

    if (file.status === FileStatus.New) {
      const input = await createPatchForNewFile(file, diff)
      return GitProcess.exec(applyArgs, repository.path, {}, write(input))
    }

    if (file.status === FileStatus.Modified) {
      const patch = await createPatchForModifiedFile(file, diff)
      return GitProcess.exec(applyArgs, repository.path, {}, write(patch))
    }

    if (file.status === FileStatus.Deleted) {
      const patch = await createPatchForDeletedFile(file, diff)
      return GitProcess.exec(applyArgs, repository.path, {}, write(patch))
    }

    return Promise.resolve()
  }

  public static createCommit(repository: Repository, summary: string, description: string, files: ReadonlyArray<WorkingDirectoryFileChange>) {
    return this.resolveHEAD(repository)
      .then(result => {
        let resetArgs = [ 'reset' ]
        if (result) {
          resetArgs = resetArgs.concat([ 'HEAD', '--mixed' ])
        }

        return resetArgs
      })
      .then(resetArgs => {
        // reset the index
        return GitProcess.exec(resetArgs, repository.path)
          .then(_ => {
            const addFiles = files.map((file, index, array) => {
              if (file.selection.getSelectionType() === DiffSelectionType.All) {
                return this.addFileToIndex(repository, file)
              } else {
                return this.applyPatchToIndex(repository, file)
              }
            })

            // TODO: pipe standard input into this command
            return Promise.all(addFiles)
              .then(() => {
                let message = summary
                if (description.length > 0) {
                  message = `${summary}\n\n${description}`
                }

                return GitProcess.exec([ 'commit', '-m',  message ] , repository.path)
              })
          })
        })
      .catch(error => {
        console.error('createCommit failed: ' + error)
      })
  }

  /**
   * Render the diff for a file within the repository
   *
   * A specific commit related to the file may be provided, otherwise the
   * working directory state will be used.
   */
  public static getDiff(repository: Repository, file: FileChange, commit: Commit | null): Promise<Diff> {

    let args: string[]

    if (commit) {
      args = [ 'log', commit.sha, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--', file.path ]
    } else if (file.status === FileStatus.New) {
      args = [ 'diff', '--no-index', '--patch-with-raw', '-z', '--', '/dev/null', file.path ]
    } else {
      args = [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--', file.path ]
    }

    return GitProcess.execWithOutput(args, repository.path)
      .then(result => parseRawDiff(result.split('\0')))
  }

  /**
   * Get the repository's history, starting from `start` and limited to `limit`
   */
  public static async getHistory(repository: Repository, start: string, limit: number): Promise<ReadonlyArray<Commit>> {
    const delimiter = '1F'
    const delimeterString = String.fromCharCode(parseInt(delimiter, 16))
    const prettyFormat = [
      '%H', // SHA
      '%s', // summary
      '%b', // body
      '%an', // author name
      '%ae', // author email
      '%aI', // author date, ISO-8601
    ].join(`%x${delimiter}`)

    const out = await GitProcess.execWithOutput([ 'log', start, `--max-count=${limit}`, `--pretty=${prettyFormat}`, '-z', '--no-color' ], repository.path)
    const lines = out.split('\0')
    // Remove the trailing empty line
    lines.splice(-1, 1)

    const commits = lines.map(line => {
      const pieces = line.split(delimeterString)
      const sha = pieces[0]
      const summary = pieces[1]
      const body = pieces[2]
      const authorName = pieces[3]
      const authorEmail = pieces[4]
      const parsedDate = Date.parse(pieces[5])
      const authorDate = new Date(parsedDate)
      return new Commit(sha, summary, body, authorName, authorEmail, authorDate)
    })

    return commits
  }

  /** Get the files that were changed in the given commit. */
  public static async getChangedFiles(repository: Repository, sha: string): Promise<ReadonlyArray<FileChange>> {
    const out = await GitProcess.execWithOutput([ 'log', sha, '-m', '-1', '--first-parent', '--name-status', '--format=format:', '-z' ], repository.path)
    const lines = out.split('\0')
    // Remove the trailing empty line
    lines.splice(-1, 1)

    const files: FileChange[] = []
    for (let i = 0; i < lines.length; i++) {
      const statusText = lines[i]
      const status = this.mapStatus(statusText)
      const name = lines[++i]
      files.push(new FileChange(name, status))
    }

    return files
  }

  /** Look up a config value by name in the repository. */
  public static async getConfigValue(repository: Repository, name: string): Promise<string | null> {
    let output: string | null = null
    try {
      output = await GitProcess.execWithOutput([ 'config', '-z', name ], repository.path)
    } catch (e) {
      // Git exits with 1 if the value isn't found. That's ok, but we'd rather
      // just treat it as null.
      if (e.code !== 1) {
        throw e
      }
    }

    if (!output) { return null }

    const pieces = output.split('\0')
    return pieces[0]
  }

  private static getAskPassTrampolinePath(): string {
    const extension = process.platform === 'win32' ? 'bat' : 'sh'
    return Path.resolve(__dirname, 'static', `ask-pass-trampoline.${extension}`)
  }

  private static getAskPassScriptPath(): string {
    return Path.resolve(__dirname, 'ask-pass.js')
  }

  /** Get the environment for authenticating remote operations. */
  private static envForAuthentication(user: User | null): Object {
    if (!user) { return {} }

    return {
      'DESKTOP_PATH': process.execPath,
      'DESKTOP_ASKPASS_SCRIPT': LocalGitOperations.getAskPassScriptPath(),
      'DESKTOP_USERNAME': user.login,
      'DESKTOP_ENDPOINT': user.endpoint,
      'GIT_ASKPASS': LocalGitOperations.getAskPassTrampolinePath(),
    }
  }

  /** Pull from the remote to the branch. */
  public static pull(repository: Repository, user: User | null, remote: string, branch: string): Promise<void> {
    return GitProcess.exec([ 'pull', remote, branch ], repository.path, LocalGitOperations.envForAuthentication(user))
  }

  /** Push from the remote to the branch, optionally setting the upstream. */
  public static push(repository: Repository, user: User | null, remote: string, branch: string, setUpstream: boolean): Promise<void> {
    const args = [ 'push', remote, branch ]
    if (setUpstream) {
      args.push('--set-upstream')
    }

    return GitProcess.exec(args, repository.path, LocalGitOperations.envForAuthentication(user))
  }

  /** Get the remote names. */
  private static async getRemotes(repository: Repository): Promise<ReadonlyArray<string>> {
    const lines = await GitProcess.execWithOutput([ 'remote' ], repository.path)
    return lines.split('\n')
  }

  /** Get the name of the default remote. */
  public static async getDefaultRemote(repository: Repository): Promise<string | null> {
    const remotes = await LocalGitOperations.getRemotes(repository)
    if (remotes.length === 0) {
      return null
    }

    const index = remotes.indexOf('origin')
    if (index > -1) {
      return remotes[index]
    } else {
      return remotes[0]
    }
  }

  /** Get the name of the current branch. */
  public static async getCurrentBranch(repository: Repository): Promise<Branch | null> {
    try {
      const untrimmedName = await GitProcess.execWithOutput([ 'rev-parse', '--abbrev-ref', 'HEAD' ], repository.path)
      let name = untrimmedName.trim()
      // New branches have a `heads/` prefix.
      name = name.replace(/^heads\//, '')

      const format = [
        '%(upstream:short)',
        '%(objectname)', // SHA
      ].join('%00')

      const line = await GitProcess.execWithOutput([ 'for-each-ref', `--format=${format}`, `refs/heads/${name}` ], repository.path)
      const pieces = line.split('\0')
      const upstream = pieces[0]
      const sha = pieces[1].trim()
      return new Branch(name, upstream.length > 0 ? upstream : null, sha, BranchType.Local)
    } catch (e) {
      // Git exits with 1 if there's the branch is unborn. We should do more
      // specific error parsing than this, but for now it'll do.
      if (e.code !== 1) {
        throw e
      }
      return null
    }
  }

  /** Get the number of commits in HEAD. */
  public static async getCommitCount(repository: Repository): Promise<number> {
    try {
      const count = await GitProcess.execWithOutput([ 'rev-list', '--count', 'HEAD' ], repository.path)
      return parseInt(count.trim(), 10)
    } catch (e) {
      // Git exits with 1 if there's the branch is unborn. We should do more
      // specific error parsing than this, but for now it'll do.
      if (e.code !== 1) {
        throw e
      }
      return 0
    }
  }

  /** Get all the branches. */
  public static async getBranches(repository: Repository, prefix: string, type: BranchType): Promise<ReadonlyArray<Branch>> {
    const format = [
      '%(refname:short)',
      '%(upstream:short)',
      '%(objectname)', // SHA
    ].join('%00')
    const names = await GitProcess.execWithOutput([ 'for-each-ref', `--format=${format}`, prefix ], repository.path)
    const lines = names.split('\n')

    // Remove the trailing newline
    lines.splice(-1, 1)

    const branches = lines.map(line => {
      const pieces = line.split('\0')
      const name = pieces[0]
      const upstream = pieces[1]
      const sha = pieces[2]
      return new Branch(name, upstream.length > 0 ? upstream : null, sha, type)
    })

    return branches
  }

  /** Create a new branch from the given start point. */
  public static createBranch(repository: Repository, name: string, startPoint: string): Promise<void> {
    return GitProcess.exec([ 'branch', name, startPoint ], repository.path)
  }

  /** Check out the given branch. */
  public static checkoutBranch(repository: Repository, name: string): Promise<void> {
    return GitProcess.exec([ 'checkout', name, '--' ], repository.path)
  }

  /** Get the `limit` most recently checked out branches. */
  public static async getRecentBranches(repository: Repository, branches: ReadonlyArray<Branch>, limit: number): Promise<ReadonlyArray<Branch>> {
    const branchesByName = branches.reduce((map, branch) => map.set(branch.name, branch), new Map<string, Branch>())

    // "git reflog show" is just an alias for "git log -g --abbrev-commit --pretty=oneline"
    // but by using log we can give it a max number which should prevent us from balling out
    // of control when there's ginormous reflogs around (as in e.g. github/github).
    const regex = new RegExp(/.*? checkout: moving from .*? to (.*?)$/i)
    const output = await GitProcess.execWithOutput([ 'log', '-g', '--abbrev-commit', '--pretty=oneline', 'HEAD', '-n', '2500' ], repository.path)
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

  /** Get the commit for the given ref. */
  public static async getCommit(repository: Repository, ref: string): Promise<Commit | null> {
    const commits = await LocalGitOperations.getHistory(repository, ref, 1)
    if (commits.length < 1) { return null }

    return commits[0]
  }

  /** Get the git dir of the path. */
  public static async getGitDir(path: string): Promise<string | null> {
    try {
      const gitDir = await GitProcess.execWithOutput([ 'rev-parse', '--git-dir' ], path)
      const trimmedDir = gitDir.trim()
      return Path.join(path, trimmedDir)
    } catch (e) {
      return null
    }
  }

  /** Is the path a git repository? */
  public static async isGitRepository(path: string): Promise<boolean> {
    const result = await this.getGitDir(path)
    return !!result
  }

  /** Init a new git repository in the given path. */
  public static initGitRepository(path: string): Promise<void> {
    return GitProcess.exec([ 'init' ], path)
  }

  /** Clone the repository to the path. */
  public static clone(url: string, path: string, user: User | null, progress: (progress: string) => void): Promise<void> {
    const env = LocalGitOperations.envForAuthentication(user)
    return GitProcess.exec([ 'clone', '--recursive', '--progress', '--', url, path ], __dirname, env, process => {
      byline(process.stderr).on('data', (chunk: string) => {
        progress(chunk)
      })
    })
  }

  /** Rename the given branch to a new name. */
  public static renameBranch(repository: Repository, branch: Branch, newName: string): Promise<void> {
    return GitProcess.exec([ 'branch', '-m', branch.nameWithoutRemote, newName ], repository.path)
  }

  /**
   * Delete the branch. If the branch has a remote branch, it too will be
   * deleted.
   */
  public static async deleteBranch(repository: Repository, branch: Branch): Promise<void> {
    const deleteRemoteBranch = (branch: Branch, remote: string) => {
      return GitProcess.exec([ 'push', remote, `:${branch.nameWithoutRemote}` ], repository.path)
    }

    if (branch.type === BranchType.Local) {
      await GitProcess.exec([ 'branch', '-D', branch.name ], repository.path)
    }

    const remote = branch.remote
    if (remote) {
      return deleteRemoteBranch(branch, remote)
    }
  }

  /** Add a new remote with the given URL. */
  public static addRemote(path: string, name: string, url: string): Promise<void> {
    return GitProcess.exec([ 'remote', 'add', name, url ], path)
  }

  /** Check out the paths at HEAD. */
  public static checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
    return GitProcess.exec([ 'checkout', '--', ...paths ], repository.path)
  }
}
