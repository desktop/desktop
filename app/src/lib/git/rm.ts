import { git } from './core'
import { Repository } from '../../models/repository'

/** Remove the given path from the index. */
export async function removeFromIndex(repository: Repository, path: string): Promise<void> {
  // Exit code of 128 means the file wasn't in the index to being with. That's
  // OK.
  await git([ 'rm', '--cached', '--', path ], repository.path, 'removeFromIndex', { successExitCodes: new Set([ 0, 128 ]) })
}
