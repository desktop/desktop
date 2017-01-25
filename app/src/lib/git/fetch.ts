import { git, envForAuthentication } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

import { GitError } from 'git-kitchen-sink'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, user: User | null, remote: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(user),
    expectedErrors: new Set([ GitError.HTTPSAuthenticationFailed, GitError.SSHAuthenticationFailed ]),
  }

  const result = await git([ 'fetch', '--prune', remote ], repository.path, 'fetch', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}
