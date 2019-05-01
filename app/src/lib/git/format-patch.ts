import { git } from './core'
import { revRange } from './rev-list'
import { Repository } from '../../models/repository'

/**
 * Generate a patch containing the changes associated with this range of commits
 */
export async function formatPatch(
  repository: Repository,
  base: string,
  head: string
): Promise<string> {
  const range = revRange(base, head)
  const result = await git(
    ['format-patch', '--stdout', range],
    repository.path,
    'formatPatch'
  )

  return result.stdout
}
