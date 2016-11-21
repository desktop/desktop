import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Push from the remote to the branch, optionally setting the upstream. */
export async function push(repository: Repository, user: User | null, remote: string, branch: string, setUpstream: boolean): Promise<void> {
  const args = [ 'push', remote, branch ]
  if (setUpstream) {
    args.push('--set-upstream')
  }

  await git(args, repository.path, 'push', { env: envForAuthentication(user) })
}
