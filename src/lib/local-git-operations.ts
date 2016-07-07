import {WorkingDirectoryStatus, FileStatus} from '../models/status'
import Repository from '../models/repository'
import {Repository as ohnogit} from 'ohnogit'

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
