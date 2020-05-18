import { GitError as DugiteError } from 'dugite'

import {
  git,
  IGitExecutionOptions,
  gitNetworkArguments,
  GitError,
} from './core'
import { Repository } from '../../models/repository'
import { IPushProgress } from '../../models/progress'
import { IGitAccount } from '../../models/git-account'
import { PushProgressParser, executionOptionsWithProgress } from '../progress'
import { AuthenticationErrors } from './authentication'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'
import { enableGitTagsCreation } from '../feature-flag'

export type PushOptions = {
  /**
   * Force-push the branch without losing changes in the remote that
   * haven't been fetched.
   *
   * See https://git-scm.com/docs/git-push#Documentation/git-push.txt---no-force-with-lease
   */
  readonly forceWithLease: boolean
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
  account: IGitAccount | null,
  remote: IRemote,
  localBranch: string,
  remoteBranch: string | null,
  options: PushOptions = {
    forceWithLease: false,
  },
  progressCallback?: (progress: IPushProgress) => void
): Promise<void> {
  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [
    ...networkArguments,
    'push',
    remote.name,
    remoteBranch ? `${localBranch}:${remoteBranch}` : localBranch,
  ]

  if (!remoteBranch) {
    args.push('--set-upstream')
  } else if (options.forceWithLease === true) {
    args.push('--force-with-lease')
  }

  if (enableGitTagsCreation()) {
    args.push('--follow-tags')
  }

  const expectedErrors = new Set<DugiteError>(AuthenticationErrors)
  expectedErrors.add(DugiteError.ProtectedBranchForcePush)

  let opts: IGitExecutionOptions = {
    env: await envForRemoteOperation(account, remote.url),
    expectedErrors,
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

  const result = await git(args, repository.path, 'push', opts)

  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  }
}
