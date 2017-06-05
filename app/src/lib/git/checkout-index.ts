import { git } from './core'
import { Repository } from '../../models/repository'

export async function checkoutIndex(repository: Repository, paths: ReadonlyArray<string>) {
  if (!paths.length) {
    return
  }

  await git([ 'checkout-index', '-f', '-u', '--stdin', '-z' ], repository.path, 'checkoutIndex', {
    stdin: paths.join('\0'),
  })
}
