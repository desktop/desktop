import { git, envForAuthentication, expectedAuthenticationErrors, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/** Push from the remote to the branch, optionally setting the upstream. */
export async function push(repository: Repository, account: Account | null, remote: string, branch: string, setUpstream: boolean, progressCallback?: (line: string) => void): Promise<void> {
  const args = [ 'push', remote, branch ]
  if (setUpstream) {
    args.push('--set-upstream')
  }

  let options: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  if (progressCallback) {
    args.push('--progress')

    options = {
      ...options,
      processCallback: (process: ChildProcess) => {
        byline(process.stderr).on('data', (chunk: string) => {
          progressCallback(chunk)
        })
      },
    }
  }

  const result = await git(args, repository.path, 'push', options)

  if (result.gitErrorDescription) {
    return Promise.reject(new Error(result.gitErrorDescription))
  }

  return Promise.resolve()
}
