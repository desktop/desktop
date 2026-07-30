import { git } from './core'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'

/**
 * Remove all files from the index
 *
 * @param repository the repository to update
 */
export async function unstageAllFiles(repository: Repository): Promise<void> {
  await git(['read-tree', '--empty'], repository.path, 'unstageAllFiles')
}

export async function unstageFilesFromUnbornRepository(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<void> {
  if (paths.length === 0) {
    return
  }

  await git(
    ['rm', '--cached', '-r', '-f', '--', ...paths],
    repository.path,
    'unstageFilesFromUnbornRepository'
  )
}

/**
 * Remove conflicted file from  working tree and index
 */
export async function removeConflictedFile(
  repository: Repository,
  file: WorkingDirectoryFileChange
) {
  await git(['rm', '--', file.path], repository.path, 'removeConflictedFile')
}
