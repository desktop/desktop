import { Repository } from '../../models/repository'
import { spawnAndComplete } from './spawn'
import { getCaptures } from '../helpers/regex'

const binaryFileEntryRe = /\-\s*\-\s*(.+)/g

/**
 * Filter a list of files on whether Git detects they are binary files
 *
 * @param repository repository to interact with
 * @param relativePaths relative paths to files in repository
 *
 * @returns subset of relative paths that were detected as binary by Git
 */
export async function filterBinaryFiles(
  repository: Repository,
  relativePaths: ReadonlyArray<string>
): Promise<ReadonlyArray<string>> {
  // 4b825dc642cb6eb9a060e54bf8d69288fbee4904 is the special id in Git which
  // represents an empty commit - in this case what we're doing is diffing the
  // current commit to an empty commit to identify which paths correspond to
  // binary files (ones that Git cannot generate the added/removed counts for)
  const args = [
    'diff',
    '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    '--numstat',
    '--',
    ...relativePaths,
  ]
  const result = await spawnAndComplete(
    args,
    repository.path,
    'diffToDetectBinaryFiles',
    new Set([0, 128])
  )

  if (result.exitCode === 128) {
    // unborn repository, `HEAD` does not exist
    return relativePaths
  }

  const outputStr = result.output.toString('utf8')
  const captures = getCaptures(outputStr, binaryFileEntryRe)
  if (captures.length === 0) {
    return []
  }

  return captures.map(array => array[0])
}
