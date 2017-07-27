import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Creates a new commit that reverts the changes of a previous commit
 *
 * @param repository  - The repository to update
 *
 * @param SHA         - The SHA of the commit to be reverted
 *
 */
export async function revertCommit(repository: Repository, SHA: string) {
  await git(['revert', '-m', '1', SHA], repository.path, 'revert')
}
