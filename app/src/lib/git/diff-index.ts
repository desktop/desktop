import { git } from './core'
import { Repository } from '../../models/repository'

export async function getChangedPathsInIndex(repository: Repository): Promise<string[]> {
  const result = await git([ 'diff-index', '--cached', '--name-only', '-z', 'HEAD' ], repository.path, 'getChangedPathsInIndex')

  return result.stdout.length
    ? result.stdout.split('\0')
    : []
}
