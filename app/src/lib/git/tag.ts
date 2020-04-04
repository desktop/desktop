import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Create a new tag on the given target commit.
 *
 * @param repository        - The repository in which to create the new tag.
 * @param name              - The name of the new tag.
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

/**
 * Gets all the local tags.
 *
 * @param repository    The repository in which to get all the tags from.
 */
export async function getAllTags(
  repository: Repository
): Promise<ReadonlyArray<string>> {
  const args = ['tag']

  const tags = await git(args, repository.path, 'getAllTags')

  return tags.stdout.split('\n').filter(s => s !== '')
}

/**
 * Gets tags in the history of the commit.
 */
export async function getTags(
  repository: Repository,
  commitish: string
): Promise<ReadonlyArray<string>> {
  const args = ['tag', '--merged', commitish]

  const tags = await git(args, repository.path, 'getBranchTags')

  return tags.stdout.split('\n').filter(s => s !== '')
}
