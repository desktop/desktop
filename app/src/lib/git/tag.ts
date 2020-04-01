import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Create a new tag on the given target commit.
 *
 * @param repository        - The repository in which to create the new branch.
 * @param name              - The name of the new branch.
 * @param targetCommitSha   - The SHA of the commit where the new tag will live on.
 */
export async function createTag(
  repository: Repository,
  name: string,
  targetCommitSha: string
): Promise<void> {
  const args = ['tag', '-a', '-m', '', name, targetCommitSha]

  await git(args, repository.path, 'createTag')
}
