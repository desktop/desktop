import { git } from './core'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'

/**
 * Creates a new commit that reverts the changes of a previous commit
 *
 * @param repository  - The repository to update
 *
 * @param commit         - The SHA of the commit to be reverted
 *
 */
export async function revertCommit(repository: Repository, commit: Commit) {
  if (commit.parentSHAs.length > 1) {
    await git(['revert', '-m', '1', commit.sha], repository.path, 'revert')
  } else {
    await git(['revert', commit.sha], repository.path, 'revert')
  }
}
