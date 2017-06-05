import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Get a list of relative paths of files which have recorded changes in the
 * index as compared to HEAD.
 *
 * @param repository The repository for which to retrieve the index changes.
 */
export async function getChangedPathsInIndex(repository: Repository): Promise<string[]> {

  const args = [ 'diff-index', '--cached', '--name-only', '--no-renames', '-z' ]

  let result = await git([ ...args, 'HEAD' ], repository.path, 'getChangedPathsInIndex', {
    successExitCodes: new Set([ 0, 128 ]),
  })

  // 128 from diff-index either means that the path isn't a repository or (more
  // likely) that the repository HEAD is unborn. If HEAD is unborn we'll diff
  // the index against the null tree instead.
  if (result.exitCode === 128) {
    result = await git([ ...args, '4b825dc642cb6eb9a060e54bf8d69288fbee4904' ], repository.path, 'getChangedPathsInIndex')
  }

  return result.stdout.length
    ? result.stdout.split('\0')
    : []
}
