import { git } from './core'
import { Repository } from '../../models/repository'

/** Check out the given branch. */
export async function checkoutBranch(repository: Repository, name: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0, 1 ]),
  }

  const checkRef = await git([ 'check-ref-format', name ], repository.path, 'checkoutBranch', options)

  if (checkRef.exitCode === 1) {
    throw new Error(`The provided name '${name}' is not a valid ref.`)
  }

  await git([ 'checkout', name, '--' ], repository.path, 'checkoutBranch')
}

/** Check out the paths at HEAD. */
export async function checkoutPaths(repository: Repository, paths: ReadonlyArray<string>): Promise<void> {
  await git([ 'checkout', 'HEAD', '--', ...paths ], repository.path, 'checkoutPaths')
}
