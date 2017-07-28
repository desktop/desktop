import { git, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import {
  CheckoutProgressParser,
  executionOptionsWithProgress,
} from '../progress'
import { ICheckoutProgress } from '../app-state'

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
  name: string,
  progressCallback?: ProgressCallback
): Promise<void> {
  let opts: IGitExecutionOptions = {}

  if (progressCallback) {
    const title = `Checking out branch ${name}`
    const kind = 'checkout'
    const targetBranch = name

    opts = executionOptionsWithProgress(
      opts,
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

  const args = progressCallback
    ? ['checkout', '--progress', name, '--']
    : ['checkout', name, '--']

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
