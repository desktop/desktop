import { git, HookCallbackOptions, IGitStringExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { IPushProgress } from '../../models/progress'
import { PushProgressParser, executionOptionsWithProgress } from '../progress'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { Branch } from '../../models/branch'

/** Preserve native pushInsteadOf behavior when push falls back to the fetch URL. */
export type AssistedCommitPushURLSource = 'push-url' | 'fetch-url'

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

  /** Desktop-owned assisted entry; never enables force, tag, or submodule pushes. */
  readonly assistedCommit?: {
    readonly expectedTip: string
    readonly remoteRef: string
    readonly pushURL: string
    readonly rawPushURL: string
    readonly pushURLSource: AssistedCommitPushURLSource
    readonly prepareForSpawn: () => Promise<() => void>
  }
} & HookCallbackOptions

/** Pin the original native URL collection without logging URL credentials. */
export function getAssistedCommitPushConfigParameters(
  remoteName: string,
  rawURL: string,
  source: AssistedCommitPushURLSource
): string {
  const parameters = process.env.GIT_CONFIG_PARAMETERS ?? ''
  const property = source === 'push-url' ? 'pushurl' : 'url'
  return `${parameters}${parameters.length === 0 ? '' : ' '}${[
    `remote.${remoteName}.${property}=`,
    `remote.${remoteName}.${property}=${rawURL}`,
    `remote.${remoteName}.mirror=false`,
  ]
    .map(parameter => `'${parameter.replace(/'/g, "'\\''")}'`)
    .join(' ')}`
}

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
  const args = ['push']
  const assisted = options?.assistedCommit
  if (
    assisted !== undefined &&
    (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(assisted.expectedTip) ||
      !assisted.remoteRef.startsWith('refs/heads/') ||
      options?.forceWithLease ||
      options?.noVerify)
  ) {
    throw new Error(
      'Assisted push requires a full commit ID and a normal branch push'
    )
  }

  if (assisted !== undefined) {
    args.push(
      '--no-force',
      '--no-mirror',
      '--no-follow-tags',
      '--recurse-submodules=no'
    )
  } else if (!remoteBranch) {
    args.push('--set-upstream')
  } else if (options?.forceWithLease) {
    args.push('--force-with-lease')
  }

  if (options?.noVerify) {
    args.push('--no-verify')
  }

  const remoteEnv = await envForRemoteOperation(assisted?.pushURL ?? remote.url)
  const pushParameters =
    assisted === undefined
      ? undefined
      : getAssistedCommitPushConfigParameters(
          remote.name,
          assisted.rawPushURL,
          assisted.pushURLSource
        )
  let opts: IGitStringExecutionOptions = {
    env: {
      ...remoteEnv,
      ...(pushParameters === undefined
        ? {}
        : { GIT_CONFIG_PARAMETERS: pushParameters }),
    },
    interceptHooks: ['pre-push'],
    onHookProgress: options?.onHookProgress,
    onHookFailure: options?.onHookFailure,
    onTerminalOutputAvailable: options?.onTerminalOutputAvailable,
    prepareForSpawn: assisted?.prepareForSpawn,
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
          branch: localBranch,
        })
      }
    )

    // Initial progress
    progressCallback({
      kind: 'push',
      title,
      value: 0,
      remote: remote.name,
      branch: localBranch,
    })
  }

  args.push(
    '--',
    remote.name,
    assisted !== undefined
      ? `${assisted.expectedTip}:${assisted.remoteRef}`
      : remoteBranch
      ? `${localBranch}:${remoteBranch}`
      : localBranch
  )

  if (assisted === undefined && tagsToPush !== null) {
    args.push(...tagsToPush)
  }

  await git(args, repository.path, 'push', opts)
}
