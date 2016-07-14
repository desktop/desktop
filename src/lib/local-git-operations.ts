import {WorkingDirectoryStatus, FileStatus, WorkingDirectoryFileChange} from '../models/status'
import Repository from '../models/repository'
import {Repository as ohnogit} from 'ohnogit'

import * as path from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'

/** The encapsulation of the result from 'git status' */
export class StatusResult {
  /** true if the repository exists at the given location */
  public readonly exists: boolean

  /** the absolute path to the repository's working directory */
  public readonly workingDirectory: WorkingDirectoryStatus

  /** factory method when 'git status' is unsuccessful */
  public static NotFound(): StatusResult {
    return new StatusResult(false, new WorkingDirectoryStatus())
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
  public readonly committerName: string
  public readonly committerEmail: string
  public readonly committerDate: Date

  public constructor(sha: string, summary: string, body: string, committerName: string, committerEmail: string, committerDate: Date) {
    this.sha = sha
    this.summary = summary
    this.body = body
    this.committerName = committerName
    this.committerEmail = committerEmail
    this.committerDate = committerDate
  }
}

export interface IFileStatus {
  name: string
  status: any
}

/**
 * Interactions with a local Git repository
 */
export class LocalGitOperations {

   /**
    *  Retrieve the status for a given repository,
    *  and fail gracefully if the location is not a Git repository
    */
   public static async getStatus(repository: Repository): Promise<StatusResult> {
      const path = repository.path
      const repo = ohnogit.open(path)

      await repo.refreshStatus()

      const statuses = repo.getCachedPathStatuses()
      let workingDirectory = new WorkingDirectoryStatus()

      for (const path in statuses) {
         const result = statuses[path]
         const status = this.mapStatus(repo, result)
         if (status !== FileStatus.Ignored) {
           workingDirectory.add(path, status)
         }
      }

      return StatusResult.FromStatus(workingDirectory)
  }

  /**
   *  Find the path to the embedded Git environment
   */
  private static resolveGit(): string {
    if (process.platform === 'darwin') {
      return path.join(__dirname, 'git/bin/git')
    } else if (process.platform === 'win32') {
      return path.join(__dirname, 'git/cmd/git.exe')
    } else {
      throw new Error('Git not supported on platform: ' + process.platform)
    }
  }

  /**
   *  Execute a command using the embedded Git environment
   */
  private static execGitCommand(args: string[], path: string): Promise<string> {
    return new Promise(function(resolve, reject) {
      const gitLocation = LocalGitOperations.resolveGit()
      fs.stat(gitLocation, function (err, result) {

        if (err) {
          reject(err)
          return
        }

        const formatArgs = 'executing: git ' + args.join(' ')

        cp.execFile(gitLocation, args, { cwd: path, encoding: 'utf8' }, function(err, output, stdErr) {
          if (err) {
            console.error(formatArgs)
            reject(err)
            return
          }

          console.log(formatArgs)
          resolve(output)
        })

      })
    })
  }

  public static async createCommit(repository: Repository, title: string, files: WorkingDirectoryFileChange[]) {

    // TODO: if repository is unborn, reset to empty tree 4b825dc642cb6eb9a060e54bf8d69288fbee4904

    // reset the index
    await this.execGitCommand([ 'reset', 'HEAD', '--mixed' ], repository.path)

    // stage each of the files
    // TODO: staging hunks needs to be done in here as well
    await files.map(async (file, index, array) => {
      await this.execGitCommand([ 'add', '-u', file.path ], repository.path)
    })

    // TODO: sanitize this input
    await this.execGitCommand([ 'commit', '-m', title ] , repository.path)
  }

  private static mapStatus(repo: ohnogit, status: number): FileStatus {
    if (repo.isStatusIgnored(status)) {
      return FileStatus.Ignored
    }

    if (repo.isStatusDeleted(status)) {
      return FileStatus.Deleted
    }

    if (repo.isStatusModified(status)) {
      return FileStatus.Modified
    }

    if (repo.isStatusNew(status)) {
      return FileStatus.New
    }

    console.log('Unknown file status encountered: ' + status)
    return FileStatus.Unknown
  }

  /** Get the repository's history. */
  public static async getHistory(repository: Repository): Promise<Commit[]> {
    const batchCount = 100
    const delimiter = '1F'
    const delimeterString = String.fromCharCode(parseInt(delimiter, 16))
    const prettyFormat = [
      '%H', // SHA
      '%s', // summary
      '%b', // body
      '%cn', // committer name
      '%ce', // committer email
      '%cI', // committer date, ISO-8601
    ].join(`%x${delimiter}`)
    const out = await this.execGitCommand([ 'log', `--max-count=${batchCount}`, `--pretty=${prettyFormat}`, '-z', '--no-color' ], repository.path)

    const lines = out.split('\0')
    // Remove the trailing empty line
    lines.splice(-1, 1)

    const commits = lines.map(line => {
      const pieces = line.split(delimeterString)
      const sha = pieces[0]
      const summary = pieces[1]
      const body = pieces[2]
      const committerName = pieces[3]
      const committerEmail = pieces[4]
      const parsedDate = Date.parse(pieces[5])
      const committerDate = new Date(parsedDate)
      return new Commit(sha, summary, body, committerName, committerEmail, committerDate)
    })

    return Promise.resolve(commits)
  }

  public static async getChangedFiles(repository: Repository, sha: string): Promise<ReadonlyArray<IFileStatus>> {
    const out = await this.execGitCommand([ 'show', sha, '--name-status', '--format=format:', '-z' ], repository.path)
    const lines = out.split('\0')
    // Remove the trailing empty line
    lines.splice(-1, 1)

    const files: IFileStatus[] = []
    for (let i = 0; i < lines.length; i++) {
      const status = lines[i]
      const name = lines[++i]
      files.push({status, name})
    }

    return files
  }
}
