import { git } from './core'
import { Repository } from '../../models/repository'

/** Remove the given path from the index. */
export async function removeFromIndex(repository: Repository, path: string): Promise<void> {
  await git([ 'rm', '--cached', '--', path ], repository.path, 'removeFromIndex', { successExitCodes: new Set([ 0 ]) })
}
