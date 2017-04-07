import { git, envForAuthentication, expectedAuthenticationErrors, GitError } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'

/** Pull from the remote to the branch. */
export async function pull(repository: Repository, account: Account | null, remote: string, branch: string): Promise<void> {

  const options = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const args = [ 'pull', remote, branch ]
  const result = await git(args, repository.path, 'pull', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new GitError(result, args))
  }

  return Promise.resolve()
}
