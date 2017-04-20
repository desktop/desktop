import { git, envForAuthentication, expectedAuthenticationErrors, GitError, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/** Pull from the remote to the branch. */
export async function pull(repository: Repository, account: Account | null, remote: string, progressCallback?: (line: string) => void): Promise<void> {

  let options: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  if (progressCallback) {
    options = {
      ...options,
      processCallback: (process: ChildProcess) => {
        byline(process.stderr).on('data', (chunk: string) => {
          progressCallback(chunk)
        })
      },
    }
  }

  const args = progressCallback
    ? [ 'pull', '--progress', remote ]
    : [ 'pull', remote ]

  const result = await git(args, repository.path, 'pull', options)

  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  }
}
