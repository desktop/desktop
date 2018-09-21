import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { Branch, BranchType } from '../../models/branch'
import { ICheckoutProgress } from '../../models/progress'
import { IGitAccount } from '../../models/git-account'

import {
  CheckoutProgressParser,
  executionOptionsWithProgress,
} from '../progress'

import { envForAuthentication, AuthenticationErrors } from './authentication'

export type ProgressCallback = (progress: ICheckoutProgress) => void

/**
 * Check out the given branch.
 *
 * @param repository - The repository in which the branch checkout should
 *                     take place
 *
 * @param branch     - The branch name that should be checked out
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the checkout operation. When provided this
 *                           enables the '--progress' command line flag for
 *                           'git checkout'.
 */
export async function checkoutBranch(
  repository: Repository,
  account: IGitAccount | null,
  branch: Branch,
  progressCallback?: ProgressCallback
): Promise<void> {
  let opts: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: AuthenticationErrors,
  }

  if (progressCallback) {
    const title = `Checking out branch ${branch.name}`
    const kind = 'checkout'
    const targetBranch = branch.name

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new CheckoutProgressParser(),
      progress => {
        if (progress.kind === 'progress') {
          const description = progress.details.text
          const value = progress.percent

          progressCallback({ kind, title, description, value, targetBranch })
        }
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0, targetBranch })
  }

  const baseArgs =
    progressCallback != null
      ? [...gitNetworkArguments, 'checkout', '--progress']
      : [...gitNetworkArguments, 'checkout']

  const args =
    branch.type === BranchType.Remote
      ? baseArgs.concat(branch.name, '-b', branch.nameWithoutRemote, '--')
      : baseArgs.concat(branch.name, '--')

  await git(args, repository.path, 'checkoutBranch', opts)
}

/** Check out the paths at HEAD. */
export async function checkoutPaths(
  repository: Repository,
  paths: ReadonlyArray<string>
): Promise<void> {
  await git(
    ['checkout', 'HEAD', '--', ...paths],
    repository.path,
    'checkoutPaths'
  )
}
