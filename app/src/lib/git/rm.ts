import { git, IGitResult } from './core'
import { Repository } from '../../models/repository'

/** Remove the given path from the index. */
export async function removeFromIndex(repository: Repository, path: string): Promise<IGitResult> {
  // Exit code of 128 means the file wasn't in the index to being with. That's
  // OK.
  return git([ 'rm', '--cached', '--', path ], repository.path, 'removeFromIndex', { successExitCodes: new Set([ 0, 128 ]) })
}
