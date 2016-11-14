import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Pull from the remote to the branch. */
export async function pull(repository: Repository, user: User | null, remote: string, branch: string): Promise<void> {
  await git([ 'pull', remote, branch ], repository.path, { env: envForAuthentication(user) })
}
