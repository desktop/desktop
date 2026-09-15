import {
  git,
  gitRebaseArguments,
  HookProgress,
  IGitStringExecutionOptions,
  TerminalOutput,
  TerminalOutputCallback,
} from './core'
import { Repository } from '../../models/repository'
import { IPullProgress } from '../../models/progress'
import { PullProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { getConfigValue } from './config'

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
  options?: {
    progressCallback?: (progress: IPullProgress) => void
    onHookProgress?: (progress: HookProgress) => void
    onHookFailure?: (
      hookName: string,
      terminalOutput: TerminalOutput
    ) => Promise<'abort' | 'ignore'>
    onTerminalOutputAvailable?: TerminalOutputCallback
    noVerify?: boolean
  }
): Promise<void> {
  let opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(remote.url),
    // git pull triggers merge or rebase hooks depending on config, instead of
    // trying to check pull.rebase and friends we'll just intercept all possible
    // hooks that could be run as part of a pull operation.
    interceptHooks: [
      'pre-merge-commit',
      'prepare-commit-msg',
      'commit-msg',
      'post-merge',
      'pre-rebase',
      'pre-commit',
      'post-rewrite',
    ],
  }

  if (options?.progressCallback) {
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

        options?.progressCallback?.({
          kind,
          title,
          description,
          value,
          remote: remote.name,
        })
      }
    )

    // Initial progress
    options.progressCallback({ kind, title, value: 0, remote: remote.name })
  }

  const args = [
    ...gitRebaseArguments(),
    'pull',
    ...(await getDefaultPullDivergentBranchArguments(repository)),
    '--recurse-submodules',
    ...(options?.progressCallback ? ['--progress'] : []),
    ...(options?.noVerify ? ['--no-verify'] : []),
    remote.name,
  ]

  await git(args, repository.path, 'pull', opts)
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
