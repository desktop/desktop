import { git } from './core'
import { Repository } from '../../models/repository'
import { ChildProcess } from 'child_process'
import { CheckoutProgressParser } from '../progress'
import { ICheckoutProgress } from '../app-state'

const byline = require('byline')

type ProcessCallback = (process: ChildProcess) => void
export type ProgressCallback = (progress: ICheckoutProgress) => void

/**
 * Check out the given branch.
 * 
 * @param repository - The repository in which the branch checkout should
 *                     take place
 * 
 * @param name - The branch name that should be checked out
 * 
 * @param progressCallback - An optional function which will be invoked
 *                           once per each line of output from Git. When
 *                           provided this also enables the '--progress'
 *                           command line flag for 'git checkout'. The
 *                           function will either be passed an object
 *                           describing the current percentage of
 *                           the checkout operation or an object representing
 *                           a context line output from Git that does not
 *                           necessarily have a direct correlation to progress.
 */
export async function checkoutBranch(repository: Repository, name: string, progressCallback?: ProgressCallback): Promise<void> {

  let processCallback: ProcessCallback | undefined = undefined

  if (progressCallback) {

    const parser = new CheckoutProgressParser()
    const title = `Checking out branch ${name}`

    processCallback = (process: ChildProcess) => {
      byline(process.stderr).on('data', (chunk: string) => {

        const progress = parser.parse(chunk)

        if (progress.kind === 'progress') {
          progressCallback({
            title,
            description: progress.details.text,
            value: progress.percent,
            targetBranch: name,
          })
        }
      })
    }

    // Send an initial progress
    progressCallback({ title, value: 0, targetBranch: name })
  }

  const args = processCallback
    ? [ 'checkout', '--progress', name, '--' ]
    : [ 'checkout', name, '--' ]

  await git(args, repository.path, 'checkoutBranch', {
    processCallback,
  })
}

/** Check out the paths at HEAD. */
export async function checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
  await git([ 'checkout', 'HEAD', '--', ...paths ], repository.path, 'checkoutPaths')
}
