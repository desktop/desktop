import { git, envForAuthentication, expectedAuthenticationErrors, GitError } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, user: Account | null, remote: string): Promise<void> {
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
