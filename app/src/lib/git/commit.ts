import { git, IGitResult } from './core'
import { isHeadUnborn } from './rev-parse'
import { stageFiles } from './add'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'

export async function createCommit(repository: Repository, message: string, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<IGitResult> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  if (await isHeadUnborn(repository)) {
    await git([ 'reset' ], repository.path, 'createCommit')
  } else {
    await git([ 'reset', 'HEAD', '--mixed' ], repository.path, 'createCommit')
  }

  await stageFiles(repository, files)

  return git([ 'commit', '-F',  '-' ] , repository.path, 'createCommit', { stdin: message })
}
