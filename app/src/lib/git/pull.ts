import { git, envForAuthentication, expectedAuthenticationErrors } from './core'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'

/** Pull from the remote to the branch. */
export async function pull(repository: Repository, user: User | null, remote: string, branch: string): Promise<void> {

  const options = {
    env: envForAuthentication(user),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const result = await git([ 'pull', remote, branch ], repository.path, 'pull', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}
