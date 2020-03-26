import { git, gitNetworkArguments, IGitExecutionOptions } from './core'

import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { ICherryPickProgress } from '../../models/progress'
import { IGitAccount } from '../../models/git-account'

import { executionOptionsWithProgress } from '../progress/from-process'
import { RevertProgressParser } from '../progress/revert'
import {
  envForRemoteOperation,
  getFallbackUrlForProxyResolve,
} from './environment'

/**
 * Creates a new commit that reverts the changes of a previous commit
 *
 * @param repository  - The repository to update
 *
 * @param commit         - The SHA of the commit to be reverted
 *
 */
export async function cherryPickCommit(
  repository: Repository,
  commit: Commit,
  account: IGitAccount | null,
  progressCallback?: (progress: ICherryPickProgress) => void
) {
  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [...networkArguments, 'cherry-pick']
  args.push(commit.sha)

  let opts: IGitExecutionOptions = {}
  if (progressCallback) {
    const env = await envForRemoteOperation(
      account,
      getFallbackUrlForProxyResolve(account, repository)
    )
    opts = await executionOptionsWithProgress(
      { env, trackLFSProgress: true },
      new RevertProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const title = progress.kind === 'progress' ? progress.details.title : ''
        const value = progress.percent

        progressCallback({
          kind: 'cherry-pick',
          description,
          value,
          title,
        })
      }
    )
  }

  await git(args, repository.path, 'cherry-pick', opts)
}
