import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IFetchProgress } from '../../models/progress'
import { FetchProgressParser, executionOptionsWithProgress } from '../progress'
import { envForAuthentication } from './authentication'

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
export async function fetch(
  repository: Repository,
  account: IGitAccount | null,
  remote: string,
  progressCallback?: (progress: IFetchProgress) => void
): Promise<void> {
  let opts: IGitExecutionOptions = {
    successExitCodes: new Set([0]),
    env: envForAuthentication(account),
  }

  if (progressCallback) {
    const title = `Fetching ${remote}`
    const kind = 'fetch'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new FetchProgressParser(),
      progress => {
        // In addition to progress output from the remote end and from
        // git itself, the stderr output from pull contains information
        // about ref updates. We don't need to bring those into the progress
        // stream so we'll just punt on anything we don't know about for now.
        if (progress.kind === 'context') {
          if (!progress.text.startsWith('remote: Counting objects')) {
            return
          }
        }

        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        progressCallback({ kind, title, description, value, remote })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0, remote })
  }

  const args = progressCallback
    ? [...gitNetworkArguments, 'fetch', '--progress', '--prune', remote]
    : [...gitNetworkArguments, 'fetch', '--prune', remote]

  await git(args, repository.path, 'fetch', opts)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(
  repository: Repository,
  account: IGitAccount | null,
  remote: string,
  refspec: string
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 128]),
    env: envForAuthentication(account),
  }

  const args = [...gitNetworkArguments, 'fetch', remote, refspec]

  await git(args, repository.path, 'fetchRefspec', options)
}
