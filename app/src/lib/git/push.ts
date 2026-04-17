import { git, HookCallbackOptions, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { IPushProgress } from '../../models/progress'
import { PushProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { Branch } from '../../models/branch'

export type PushOptions = {
  /**
   * Force-push the branch without losing changes in the remote that
   * haven't been fetched.
   *
   * See https://git-scm.com/docs/git-push#Documentation/git-push.txt---no-force-with-lease
   */
  readonly forceWithLease?: boolean

  /** A branch to push instead of the current branch */
  readonly branch?: Branch

  readonly noVerify?: boolean
} & HookCallbackOptions

export type PushRefspecOptions = {
  readonly forceWithLease?: boolean
  readonly noVerify?: boolean
} & HookCallbackOptions

/**
 * Push from the remote to the branch, optionally setting the upstream.
 *
 * @param repository - The repository from which to push
 *
 * @param account - The account to use when authenticating with the remote
 *
 * @param remote - The remote to push the specified branch to
 *
 * @param localBranch - The local branch to push
 *
 * @param remoteBranch - The remote branch to push to
 *
 * @param tagsToPush - The tags to push along with the branch.
 *
 * @param options - Optional customizations for the push execution.
 *                  see PushOptions for more information.
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the push operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git push'.
 */
export async function push(
  repository: Repository,
  remote: IRemote,
  localBranch: string,
  remoteBranch: string | null,
  tagsToPush: ReadonlyArray<string> | null,
  options?: PushOptions,
  progressCallback?: (progress: IPushProgress) => void
): Promise<void> {
  const refspec = remoteBranch ? `${localBranch}:${remoteBranch}` : localBranch

  return pushRefspecInternal(
    repository,
    remote,
    refspec,
    {
      ...options,
      setUpstream: remoteBranch === null,
    },
    progressCallback,
    localBranch,
    tagsToPush
  )
}

async function pushRefspecInternal(
  repository: Repository,
  remote: IRemote,
  refspec: string,
  options: PushRefspecOptions & { readonly setUpstream?: boolean },
  progressCallback: ((progress: IPushProgress) => void) | undefined,
  progressBranchName: string,
  additionalArgs?: ReadonlyArray<string> | null
): Promise<void> {
  const args = [
    'push',
    remote.name,
    refspec,
  ]

  if (additionalArgs !== null && additionalArgs !== undefined) {
    args.push(...additionalArgs)
  }
  if (options.setUpstream) {
    args.push('--set-upstream')
  } else if (options.forceWithLease) {
    args.push('--force-with-lease')
  }

  if (options.noVerify) {
    args.push('--no-verify')
  }

  let opts: IGitStringExecutionOptions = {
    env: await envForRemoteOperation(remote.url),
    interceptHooks: ['pre-push'],
    onHookProgress: options.onHookProgress,
    onHookFailure: options.onHookFailure,
    onTerminalOutputAvailable: options.onTerminalOutputAvailable,
  }

  if (progressCallback) {
    args.push('--progress')
    const title = `Pushing to ${remote.name}`
    const kind = 'push'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new PushProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        progressCallback({
          kind,
          title,
          description,
          value,
          remote: remote.name,
          branch: progressBranchName,
        })
      }
    )

    // Initial progress
    progressCallback({
      kind: 'push',
      title,
      value: 0,
      remote: remote.name,
      branch: progressBranchName,
    })
  }

  await git(args, repository.path, 'push', opts)
}

export async function pushRefspec(
  repository: Repository,
  remote: IRemote,
  refspec: string,
  options?: PushRefspecOptions,
  progressCallback?: (progress: IPushProgress) => void
): Promise<void> {
  const branch = refspec.split(':', 2).at(-1) ?? refspec

  return pushRefspecInternal(
    repository,
    remote,
    refspec,
    options ?? {},
    progressCallback,
    branch
  )
}
