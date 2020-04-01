import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Create a new tag on the given target commit.
 *
 * @param repository        - The repository in which to create the new branch
 * @param name              - The name of the new branch.
 * @param targetCommittish  - A committish string where the new tag will live on,
 *                            or undefined if the tag should be created on the
 *                            the current state of HEAD.
 */
export async function createTag(
  repository: Repository,
  name: string,
  targetCommittish: string | null
): Promise<void> {
  const args = ['tag', '-a', '-m', '', name]

  if (targetCommittish !== null) {
    args.push(targetCommittish)
  }

  await git(args, repository.path, 'createTag')
}
