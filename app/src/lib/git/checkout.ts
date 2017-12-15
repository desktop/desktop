import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import {
  CheckoutProgressParser,
  executionOptionsWithProgress,
} from '../progress'
import { ICheckoutProgress } from '../app-state'

import {
  IGitAccount,
  envForAuthentication,
  AuthenticationErrors,
} from './authentication'

/**
 * Abstracts away all the optional arguments one can pass
 * to the checkoutBranch function
 */
export interface ICheckoutOptions {
  readonly progressCallback?: ProgressCallback
  readonly baseRef?: string
}

export type ProgressCallback = (progress: ICheckoutProgress) => void

/**
 * Check out the given branch.
 *
 * @param repository - The repository in which the branch checkout should
 *                     take place
 *
 * @param name       - The branch name that should be checked out
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
  name: string,
  options: ICheckoutOptions = {}
): Promise<void> {
  let gitExecutionOpts: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: AuthenticationErrors,
  }

  const progressCallback = options.progressCallback

  if (progressCallback != null) {
    const title = `Checking out branch ${name}`
    const kind = 'checkout'
    const targetBranch = name

    gitExecutionOpts = await executionOptionsWithProgress(
      { ...gitExecutionOpts, trackLFSProgress: true },
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

  const args =
    progressCallback != null
      ? [...gitNetworkArguments, 'checkout', '--progress', name, '--']
      : [...gitNetworkArguments, 'checkout', name, '--']

  await git(args, repository.path, 'checkoutBranch', gitExecutionOpts)
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
