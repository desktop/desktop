import { Repository } from '../../models/repository'
import { getStatus } from './status'
import { unstageFiles } from './update-index'

/**
 * Remove all files from the index
 *
 * @param repository the repository to update
 */
export async function unstageAllFiles(repository: Repository): Promise<void> {
  const result = await getStatus(repository)
  if (result) {
    await unstageFiles(repository, result.workingDirectory.files)
  }
}
