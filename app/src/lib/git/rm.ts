import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Remove all files from the index
 *
 * @param repository the repository to update
 */
export async function removeAllFromIndex(
  repository: Repository
): Promise<void> {
  // --cached - the file is only removed from the index
  // -r - recursively remove files
  await git(['rm', '--cached', '-r', '.'], repository.path, 'removeCachedItems')
}
