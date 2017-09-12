import { git } from './core'
import { Repository } from '../../models/repository'

export async function removeCachedItems(repository: Repository): Promise<void> {
  await git(
    ['rm', '--cached', '.', '-rf'],
    repository.path,
    'removeCachedItems'
  )
}
