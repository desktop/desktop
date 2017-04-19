import { git, envForAuthentication, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/**
 * Fetch from the given remote.
 * 
 * @param repository - The repository to fetch into
 * 
 * @param account - The account to use when authenticating with the remote
 *
 * @param remote - The remote to fetch from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           once per each line of output from Git. When
 *                           provided this also enables the '--progress'
 *                           command line flag for 'git push'.
 */
export async function fetch(repository: Repository, account: Account | null, remote: string, progressCallback?: (line: string) => void): Promise<void> {
  let options: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(account),
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
    ? [ 'fetch', '--progress', '--prune', remote ]
    : [ 'fetch', '--prune', remote ]

  await git(args, repository.path, 'fetch', options)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(repository: Repository, account: Account | null, remote: string, refspec: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0, 128 ]),
    env: envForAuthentication(account),
  }

  await git([ 'fetch', remote, refspec ], repository.path, 'fetchRefspec', options)
}

