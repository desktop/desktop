import { git } from './core'
import { isHeadUnborn } from './rev-parse'
import { stageFiles } from './add'
import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import { IAppError } from '../app-state'

export async function createCommit(repository: Repository, message: string, files: ReadonlyArray<WorkingDirectoryFileChange>): Promise<boolean> {
  // Clear the staging area, our diffs reflect the difference between the
  // working directory and the last commit (if any) so our commits should
  // do the same thing.
  if (await isHeadUnborn(repository)) {
    await git([ 'reset' ], repository.path, 'createCommit')
  } else {
    await git([ 'reset', 'HEAD', '--mixed' ], repository.path, 'createCommit')
  }

  await stageFiles(repository, files)

  const result = await git([ 'commit', '-F',  '-' ] , repository.path, 'createCommit', { stdin: message })

  if (result.exitCode === 0) {
    return true
  }

  const output = result.stderr.trim()

  let standardError = ''
  if (output.length > 0) {
    standardError = `, with output: '${output}'`
  }
  const exitCode = result.exitCode
  const appError: IAppError = {
    name: 'commit-failed',
    message: `Commit failed - exit code ${exitCode} received${standardError}`,
  }

  throw appError
}
