import {
  git,
  GitError,
  IGitExecutionOptions,
  gitNetworkArguments,
  gitRebaseArguments,
} from './core'
import { Repository } from '../../models/repository'
import { IPullProgress } from '../../models/progress'
import { PullProgressParser, executionOptionsWithProgress } from '../progress'
import { AuthenticationErrors } from './authentication'
import { enableRecurseSubmodulesFlag } from '../feature-flag'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { getConfigValue } from './config'

async function getPullArgs(
  repository: Repository,
  remote: string,
  progressCallback?: (progress: IPullProgress) => void
) {
  return [
    ...gitNetworkArguments(),
    ...gitRebaseArguments(),
    'pull',
    ...(await getDefaultPullDivergentBranchArguments(repository)),
    ...(enableRecurseSubmodulesFlag() ? ['--recurse-submodules'] : []),
    ...(progressCallback ? ['--progress'] : []),
    remote,
  ]
}

/**
 * Pull from the specified remote.
 *
 * @param repository - The repository in which the pull should take place
 *
 * @param remote     - The name of the remote that should be pulled from
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the pull operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git pull'.
 */
export async function pull(
  repository: Repository,
  remote: IRemote,
  progressCallback?: (progress: IPullProgress) => void
): Promise<void> {
  let opts: IGitExecutionOptions = {
    env: await envForRemoteOperation(remote.url),
    expectedErrors: AuthenticationErrors,
  }

  if (progressCallback) {
    const title = `Pulling ${remote.name}`
    const kind = 'pull'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new PullProgressParser(),
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

  const args = await getPullArgs(repository, remote.name, progressCallback)
  const result = await git(args, repository.path, 'pull', opts)

  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  }
}

/**
 * Defaults the pull default for divergent paths to try to fast forward and if
 * not perform a merge. Aka uses the flag --ff
 *
 * It checks whether the user has a config set for this already, if so, no need for
 * default.
 */
async function getDefaultPullDivergentBranchArguments(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  try {
    const pullFF = await getConfigValue(repository, 'pull.ff')
    return pullFF !== null ? [] : ['--ff']
  } catch (e) {
    log.error("Couldn't read 'pull.ff' config", e)
  }

  // If there is a failure in checking the config, we still want to use any
  // config and not overwrite the user's set config behavior. This will show the
  // git error if no config is set.
  return []
}
