import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

import { GitError } from 'git-kitchen-sink'

/** Push from the remote to the branch, optionally setting the upstream. */
export async function push(repository: Repository, user: User | null, remote: string, branch: string, setUpstream: boolean): Promise<void> {
  const args = [ 'push', remote, branch ]
  if (setUpstream) {
    args.push('--set-upstream')
  }

  const options = {
    env: envForAuthentication(user),
    expectedErrors: new Set([
      GitError.HTTPSAuthenticationFailed,
      GitError.SSHAuthenticationFailed,
      GitError.HTTPSRepositoryNotFound,
      GitError.SSHRepositoryNotFound,
    ]),
  }

  const result = await git(args, repository.path, 'push', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}
