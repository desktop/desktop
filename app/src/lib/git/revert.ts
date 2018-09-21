import { git, gitNetworkArguments, IGitExecutionOptions } from './core'
import { envForAuthentication } from './authentication'

import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { IRevertProgress } from '../../models/progress'
import { IGitAccount } from '../../models/git-account'

import { executionOptionsWithProgress } from '../progress/from-process'
import { RevertProgressParser } from '../progress/revert'

/**
 * Creates a new commit that reverts the changes of a previous commit
 *
 * @param repository  - The repository to update
 *
 * @param commit         - The SHA of the commit to be reverted
 *
 */
export async function revertCommit(
  repository: Repository,
  commit: Commit,
  account: IGitAccount | null,
  progressCallback?: (progress: IRevertProgress) => void
) {
  const args = [...gitNetworkArguments, 'revert']
  if (commit.parentSHAs.length > 1) {
    args.push('-m', '1')
  }

  args.push(commit.sha)

  let opts: IGitExecutionOptions = {}
  if (progressCallback) {
    const env = envForAuthentication(account)
    opts = await executionOptionsWithProgress(
      { env, trackLFSProgress: true },
      new RevertProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const title = progress.kind === 'progress' ? progress.details.title : ''
        const value = progress.percent

        progressCallback({ kind: 'revert', description, value, title })
      }
    )
  }

  await git(args, repository.path, 'revert', opts)
}
