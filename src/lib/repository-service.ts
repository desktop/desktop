import WorkingDirectoryStatus from '../models/status'
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

      let status = new WorkingDirectoryStatus()

      for (let path in statuses) {
         const result = statuses[path]
         status.add(path, result)
      }

      return status
   }
}
