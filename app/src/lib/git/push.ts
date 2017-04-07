import { git, envForAuthentication, expectedAuthenticationErrors } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'

/** Push from the remote to the branch, optionally setting the upstream. */
export async function push(repository: Repository, account: Account | null, remote: string, branch: string, setUpstream: boolean): Promise<void> {
  const args = [ 'push', remote, branch ]
  if (setUpstream) {
    args.push('--set-upstream')
  }

  const options = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  const result = await git(args, repository.path, 'push', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}
