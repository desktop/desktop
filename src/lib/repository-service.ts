import {WorkingDirectoryStatus, FileStatus} from '../models/status'
import Repository from '../models/repository'
import {Repository as ohnogit} from 'ohnogit'

/**
 * Interactions with a local Git repository
 * TODO: better name for this component
 */
export default class RepositoryService {

   /** Retrieve the status for a given repository */
   public static async getStatus(repository: Repository): Promise<WorkingDirectoryStatus> {
      const path = repository.getPath()
      const repo = ohnogit.open(path)
      await repo.refreshStatus()

      const statuses = repo.getCachedPathStatuses()

      let workingDirectory = new WorkingDirectoryStatus()

      for (let path in statuses) {
         const result = statuses[path]
         const status = this.mapStatus(result)
         workingDirectory.add(path, status)
      }

      return workingDirectory
   }

   // TODO: we also get the index status here
   // maybe we should look at all these values too
   // https://github.com/libgit2/libgit2/blob/77394a27af283b366fa8bb444d29670131bfa104/include/git2/status.h#L32-L50
    private static mapStatus(status: number): FileStatus {
      if (status | 512) {
        return FileStatus.Deleted
      } else if (status | 256) {
        return FileStatus.Modified
      } else if (status | 128) {
        return FileStatus.New
      } else {
        console.log('Unknown file status encountered: ' + status)
        return FileStatus.Unknown
      }
    }
}
