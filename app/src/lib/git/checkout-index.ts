import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Forcefully updates the working directory with information from the index
 * for a given set of files.
 *
 * This method is essentially the same as running `git checkout -- files`
 * except by using `checkout-index` we can pass the files we want updated
 * on stdin, avoiding all issues with too long arguments.
 *
 * Note that this function will not yield errors for paths that don't
 * exist in the index (-q).
 *
 * @param repository The repository in which to update the working directory
 *                   with information from the index
 *
 * @param paths      The relative paths in the working directory to update
 *                   with information from the index.
 */
export async function checkoutIndex(
  repository: Repository,
  paths: ReadonlyArray<string>
) {
  if (!paths.length) {
    return
  }

  await git(
    ['checkout-index', '-f', '-u', '-q', '--stdin', '-z'],
    repository.path,
    'checkoutIndex',
    {
      stdin: paths.join('\0'),
    }
  )
}
