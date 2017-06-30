import { git, IGitResult } from './core'
import { Repository } from '../../models/repository'

/** Remove the given path from the index. */
export async function removeFromIndex(
  repository: Repository,
  path: string
): Promise<IGitResult> {
  // exit code of 128 means the file wasn't in the index to being with.
  // That's OK.
  const options = { successExitCodes: new Set([0, 128]) }

  // '-f' is used here in the unlikely scenario the staged file and working
  // directory file have different content.
  return git(
    ['rm', '--cached', '-f', '--', path],
    repository.path,
    'removeFromIndex',
    options
  )
}
