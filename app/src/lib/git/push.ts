import {
  git,
  envForAuthentication,
  expectedAuthenticationErrors,
  IGitExecutionOptions,
  gitNetworkArguments,
} from './core'

import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { PushProgressParser, executionOptionsWithProgress } from '../progress'
import { IPushProgress } from '../app-state'

/**
 * Push from the remote to the branch, optionally setting the upstream.
 * 
 * @param repository - The repository from which to push
 * 
 * @param account - The account to use when authenticating with the remote
 *
 * @param remote - The remote to push the specified branch to
 *
 * @param branch - The branch to push
 *
 * @param setUpstream - Whether or not to update the tracking information
 *                      of the specified branch to point to the remote.
 * 
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the push operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git push'.
 */
export async function push(repository: Repository, account: Account | null, remote: string, branch: string, setUpstream: boolean, progressCallback?: (progress: IPushProgress) => void): Promise<void> {
  const args = [
    ...gitNetworkArguments,
    'push', remote, branch,
  ]

  if (setUpstream) {
    args.push('--set-upstream')
  }

  let opts: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  if (progressCallback) {
    args.push('--progress')
    const title = `Pushing to ${remote}`
    const kind = 'push'

    opts = executionOptionsWithProgress(opts, new PushProgressParser(), (progress) => {
      const description = progress.kind === 'progress'
        ? progress.details.text
        : progress.text
      const value = progress.percent

      progressCallback({ kind, title, description, value, remote, branch })
    })

    // Initial progress
    progressCallback({ kind: 'push', title, value: 0, remote, branch })
  }

  const result = await git(args, repository.path, 'push', opts)

  if (result.gitErrorDescription) {
    throw new Error(result.gitErrorDescription)
  }
}
