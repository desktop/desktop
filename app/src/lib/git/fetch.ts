import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, user: User | null, remote: string): Promise<void> {
  await git([ 'fetch', '--prune', remote ], repository.path, 'fetch', { env: envForAuthentication(user) })
}
