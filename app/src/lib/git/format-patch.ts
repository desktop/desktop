import { git } from './core'
import { revRange } from './rev-list'
import { Repository } from '../../models/repository'

/**
 * Generate a patch containing the changes associated with this range of commits
 *
 * @param repository where to generate path from
 * @param base starting commit in range
 * @param head ending commit in rage
 * @returns patch generated
 */
export async function formatPatch(
  repository: Repository,
  base: string,
  head: string
): Promise<string> {
  const range = revRange(base, head)
  const result = await git(
    ['diff', '--unified=1', '--minimal', range],
    repository.path,
    'formatPatch'
  )

  return result.stdout
}
