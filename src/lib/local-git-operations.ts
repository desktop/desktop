import {WorkingDirectoryStatus, FileStatus, WorkingDirectoryFileChange} from '../models/status'
import Repository from '../models/repository'
import {Repository as ohnogit} from 'ohnogit'

import * as path from 'path'
import * as fs from 'fs'
import * as cp from 'child_process'

/** The encapsulation of a 'git status' command */
export class StatusResult {
  private exists: boolean
  private workingDirectory: WorkingDirectoryStatus

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

  public getExists(): boolean {
    return this.exists
  }

  public getWorkingDirectory(): WorkingDirectoryStatus {
    return this.workingDirectory
  }
}

/**
 * Interactions with a local Git repository
 */
export default class LocalGitOperations {

   /**
    *  Retrieve the status for a given repository,
    *  and fail gracefully if the location is not a Git repository
    */
   public static async getStatus(repository: Repository): Promise<StatusResult> {
      const path = repository.getPath()
      const repo = ohnogit.open(path)

      try {
        await repo.refreshStatus()
      } catch (e) {
        console.log(e)
        return StatusResult.NotFound()
      }

      const statuses = repo.getCachedPathStatuses()
      let workingDirectory = new WorkingDirectoryStatus()

      for (let path in statuses) {
         const result = statuses[path]
         const status = this.mapStatus(repo, result)
         if (status !== FileStatus.Ignored) {
           workingDirectory.add(path, status)
         }
      }

      return StatusResult.FromStatus(workingDirectory)
   }

   private static resolveGit(): string {
     if (process.platform === 'darwin') {
        return path.join(__dirname, 'git/bin/git')
     } else if (process.platform === 'win32') {
        return path.join(__dirname, 'git/cmd/git.exe')
     } else {
        throw new Error('Git not supported on platform: ' + process.platform)
     }
   }

   public static createCommit(repository: Repository, title: string, files: WorkingDirectoryFileChange[]) {
     const gitLocation = LocalGitOperations.resolveGit()
     const exists = fs.statSync(gitLocation)
     console.log('exists: ' + exists.isFile())

     // reset the index
     cp.execFileSync(gitLocation, [ 'reset', 'HEAD', '--mixed' ] , { cwd: repository.getPath(), encoding: 'utf8' })

     // stage each of the files
     // TODO: staging hunks needs to be done in here as well
     files.map((file, index, array) => {
        cp.execFileSync(gitLocation, [ 'add', '-u', file.getPath() ] , { cwd: repository.getPath() })
     })

     const formattedCommitTitle = '"' + title + '"'
     const output = cp.execFileSync(gitLocation, [ 'commit', '-m', formattedCommitTitle ] , { cwd: repository.getPath(), encoding: 'utf8' })
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
}
