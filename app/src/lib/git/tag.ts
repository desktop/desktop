import { git, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IRemote } from '../../models/remote'

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
 * Fetches all the tags from the remote repository (it does a network request).
 *
 * @param repository  - The repository from where to fetch the tags.
 * @param account     - The account to use when authenticating with the remote.
 * @param remote      - The remote from where to fetch the tags.
 */
export async function fetchRemoteTags(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote
): Promise<ReadonlyArray<string>> {
  const networkArguments = await gitNetworkArguments(repository, account)
  const args = [...networkArguments, 'ls-remote', '--tags', remote.name]

  const result = await git(args, repository.path, 'fetchUnpushedTags')

  const tags = result.stdout
    .split('\n')
    .map(line => {
      const [, fullTagName] = line.split('\t')

      if (fullTagName === undefined || fullTagName === '') {
        return null
      }

      // When an annotated tag is found, a duplicated entry is printed
      // with the tag name which ends with `^{}`
      // More info:
      // https://git-scm.com/docs/gitrevisions#Documentation/gitrevisions.txt-emltrevgtemegemv0998em
      if (fullTagName.endsWith('^{}')) {
        return null
      }

      return fullTagName.replace(/^refs\/tags\//, '').replace(/^{}/, '')
    })
    .filter((tag): tag is string => tag !== null)

  return tags
}
