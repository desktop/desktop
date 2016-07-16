import { WorkingDirectoryStatus, WorkingDirectoryFileChange, FileChange, FileStatus } from '../models/status'
import Repository from '../models/repository'

import { GitProcess, GitError, GitErrorCode } from './git-process'

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

            let workingDirectory = new WorkingDirectoryStatus()

            for (const index in lines) {
              const line = lines[index]
              const result = regex.exec(line)

              if (result) {
                const modeText = result[regexGroups.mode]
                const path = result[regexGroups.path]

                const mode = this.mapStatus(modeText)
                workingDirectory.add(path, mode)
              }
            }

            return StatusResult.FromStatus(workingDirectory)
        })
        .catch(error => {
          if (error) {
            const gitError = error as GitError
            if (gitError) {
              const code = gitError.errorCode
              if (code === GitErrorCode.NotFound) {
                return false
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
                return false
              }
              throw new Error('unable to resolve HEAD, got error code: ' + code)
            }
         }

        throw new Error('unable to resolve HEAD, got unknown error: ' + error)
      })
  }

  public static createCommit(repository: Repository, title: string, files: WorkingDirectoryFileChange[]) {
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
            // TODO: staging hunks needs to be done in here as well
            const addFiles = files.map((file, index, array) => {

              let addFileArgs: string[] = []

              if (file.status === FileStatus.New) {
                addFileArgs = [ 'add', file.path ]
              } else {
                addFileArgs = [ 'add', '-u', file.path ]
              }

              return GitProcess.exec(addFileArgs, repository.path)
            })

            // TODO: pipe standard input into this command
            return Promise.all(addFiles)
              .then(() => {
                return GitProcess.exec([ 'commit', '-m',  title ] , repository.path)
              })
          })
        })
      .catch(error => {
          console.error('createCommit failed: ' + error)
      })
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
    const out = await GitProcess.execWithOutput([ 'log', `--max-count=${batchCount}`, `--pretty=${prettyFormat}`, '-z', '--no-color' ], repository.path)
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

  /** Get the files that were changed in the given commit. */
  public static async getChangedFiles(repository: Repository, sha: string): Promise<ReadonlyArray<FileChange>> {
    const out = await GitProcess.execWithOutput([ 'show', sha, '--name-status', '--format=format:', '-z' ], repository.path)
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
  public static async getConfigValue(repository: Repository, name: string): Promise<string> {
    const output = await GitProcess.execWithOutput([ 'config', '-z', name ], repository.path)
    const pieces = output.split('\0')
    return pieces[0]
  }
}
