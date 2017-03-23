import { git, envForAuthentication, expectedAuthenticationErrors, GitError } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, user: User | null, remote: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(user),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const args = [ 'fetch', '--prune', remote ]
  const result = await git(args, repository.path, 'fetch', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new GitError(result, args))
  }

  return Promise.resolve()
}
