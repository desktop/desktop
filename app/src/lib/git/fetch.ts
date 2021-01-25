import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IFetchProgress } from '../../models/progress'
import { FetchProgressParser, executionOptionsWithProgress } from '../progress'
import { enableRecurseSubmodulesFlag } from '../feature-flag'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { IBranchBasicInfo } from '../../models/branch'

async function getFetchArgs(
  repository: Repository,
  remote: string,
  account: IGitAccount | null,
  progressCallback?: (progress: IFetchProgress) => void
) {
  const networkArguments = await gitNetworkArguments(repository, account)

  if (enableRecurseSubmodulesFlag()) {
    return progressCallback != null
      ? [
          ...networkArguments,
          'fetch',
          '--progress',
          '--prune',
          '--recurse-submodules=on-demand',
          remote,
        ]
      : [
          ...networkArguments,
          'fetch',
          '--prune',
          '--recurse-submodules=on-demand',
          remote,
        ]
  } else {
    return progressCallback != null
      ? [...networkArguments, 'fetch', '--progress', '--prune', remote]
      : [...networkArguments, 'fetch', '--prune', remote]
  }
}

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
  remote: IRemote,
  progressCallback?: (progress: IFetchProgress) => void
): Promise<void> {
  let opts: IGitExecutionOptions = {
    successExitCodes: new Set([0]),
    env: await envForRemoteOperation(account, remote.url),
  }

  if (progressCallback) {
    const title = `Fetching ${remote.name}`
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

        progressCallback({
          kind,
          title,
          description,
          value,
          remote: remote.name,
        })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0, remote: remote.name })
  }

  const args = await getFetchArgs(
    repository,
    remote.name,
    account,
    progressCallback
  )
  await git(args, repository.path, 'fetch', opts)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  refspec: string
): Promise<void> {
  const options = {
    successExitCodes: new Set([0, 128]),
    env: await envForRemoteOperation(account, remote.url),
  }

  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [...networkArguments, 'fetch', remote.name, refspec]

  await git(args, repository.path, 'fetchRefspec', options)
}

export async function fastForwardBranches(
  repository: Repository,
  branches: ReadonlyArray<IBranchBasicInfo>
): Promise<void> {
  const opts: IGitExecutionOptions = {
    successExitCodes: new Set([0, 1]),
    env: {
      GIT_REFLOG_ACTION: 'pull',
    },
  }

  const refPairs = branches.map(branch => `${branch.upstreamRef}:${branch.ref}`)

  await git(
    [
      '-c',
      'fetch.output=full',
      'fetch',
      '.',
      '--show-forced-updates',
      '-v',
      // TODO: Once we upgrade to git 2.29 we can use --stdin to pass the refs,
      // avoiding hitting any shell limitations related to the length of the
      // command.
      ...refPairs,
    ],
    repository.path,
    'fastForwardBranches',
    opts
  )
}
