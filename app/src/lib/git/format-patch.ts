import { revRange } from './rev-list'
import { Repository } from '../../models/repository'
import { spawnAndComplete } from './spawn'

/**
 * Generate a patch representing the changes associated with a range of commits
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
  const { output } = await spawnAndComplete(
    ['format-patch', '--unified=1', '--minimal', '--stdout', range],
    repository.path,
    'formatPatch'
  )
  return output.toString('utf8')
}
