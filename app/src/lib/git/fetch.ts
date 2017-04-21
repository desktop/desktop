import { git, envForAuthentication, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { FetchProgressParser, executionOptionsWithProgress } from '../progress'
import { IFetchProgress } from '../app-state'

/**
 * Fetch from the given remote.
 * 
 * @param repository - The repository to fetch into
 * 
 * @param account    - The account to use when authenticating with the remote
 *
 * @param remote     - The remote to fetch from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the fetch operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git fetch'.
 */
export async function fetch(repository: Repository, account: Account | null, remote: string, progressCallback?: (progress: IFetchProgress) => void): Promise<void> {
  let opts: IGitExecutionOptions = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(account),
  }

  if (progressCallback) {
    const title = `Fetching ${remote}`
    const kind = 'fetch'

    opts = executionOptionsWithProgress(opts, new FetchProgressParser(), (progress) => {
      const description = progress.kind === 'progress'
        ? progress.details.text
        : progress.text
      const value = progress.percent

      progressCallback({ kind, title, description, value, remote })
    })

    // Initial progress
    progressCallback({ kind, title, value: 0, remote })
  }

  const args = progressCallback
    ? [ 'fetch', '--progress', '--prune', remote ]
    : [ 'fetch', '--prune', remote ]

  await git(args, repository.path, 'fetch', opts)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(repository: Repository, account: Account | null, remote: string, refspec: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0, 128 ]),
    env: envForAuthentication(account),
  }

  await git([ 'fetch', remote, refspec ], repository.path, 'fetchRefspec', options)
}

