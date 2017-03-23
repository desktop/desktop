import { git, envForAuthentication, expectedAuthenticationErrors } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, user: User | null, remote: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(user),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const result = await git([ 'fetch', '--prune', remote ], repository.path, 'fetch', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(repository: Repository, user: User | null, remote: string, refspec: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0, 128 ]),
    env: envForAuthentication(user),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const result = await git([ 'fetch', remote, refspec ], repository.path, 'fetchRefspec', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}

