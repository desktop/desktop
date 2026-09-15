import { git } from './core'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'

/**
 * Add a conflicted file to the index.
 *
 * Typically done after having resolved conflicts either manually
 * or through checkout --theirs/--ours.
 */
export async function addConflictedFile(
  repository: Repository,
  file: WorkingDirectoryFileChange
) {
  await git(['add', '--', file.path], repository.path, 'addConflictedFile')
}
