import { git } from './core'
import { Repository } from '../../models/repository'
import { ChildProcess } from 'child_process'

const byline = require('byline')

type ProcessCallback = (process: ChildProcess) => void
export type ProgressCallback = (line: string) => void

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
 *                           command line flag for 'git checkout'.
 */
export async function checkoutBranch(repository: Repository, name: string, progressCallback?: ProgressCallback): Promise<void> {

  let processCallback: ProcessCallback | undefined = undefined

  if (progressCallback) {
    processCallback = (process: ChildProcess) => {
      byline(process.stderr).on('data', (chunk: string) => {
        progressCallback(chunk)
      })
    }
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
