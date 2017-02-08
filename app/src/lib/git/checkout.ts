import { git } from './core'
import { Repository } from '../../models/repository'

/** Check out the given branch. */
export async function checkoutBranch(repository: Repository, name: string): Promise<void> {
  await git([ 'checkout', name, '--' ], repository.path, 'checkoutBranch')
}


/** Check out the paths at HEAD. */
export async function checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
  await git([ 'checkout', 'HEAD', '--', ...paths ], repository.path, 'checkoutPaths')
}
