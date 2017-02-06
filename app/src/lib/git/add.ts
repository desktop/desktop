import { git } from './core'
import { FileStatus, WorkingDirectoryFileChange } from '../../models/status'
import { Repository } from '../../models/repository'
import { DiffSelectionType } from '../../models/diff'
import { applyPatchToIndex } from './apply'

export async function addFileToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {

  if (file.status === FileStatus.New) {
    await git([ 'add', '--', file.path ], repository.path, 'addFileToIndex')
  } else if (file.status === FileStatus.Copied) {
    // TODO: maybe something necessary here with the oldPath?
    await git([ 'add', '--', file.path ], repository.path, 'addFileToIndex')
  } else if (file.status === FileStatus.Renamed && file.oldPath) {
    await git([ 'add', '--', file.path ], repository.path, 'addFileToIndex')
    await git([ 'add', '-u', '--', file.oldPath ], repository.path, 'addFileToIndex')
  } else {
    await git([ 'add', '-u', '--', file.path ], repository.path, 'addFileToIndex')
  }
}

/**
 * Stage all the given files by either staging the entire path or by applying
 * a patch.
 */
export async function stageFiles(repository: Repository, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<void> {
  for (const file of files) {
    if (file.selection.getSelectionType() === DiffSelectionType.All) {
      await addFileToIndex(repository, file)
    } else {
      await applyPatchToIndex(repository, file)
    }
  }
}
