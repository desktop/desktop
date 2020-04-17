import { git, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IRemote } from '../../models/remote'
import { envForRemoteOperation } from './environment'

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
 * Fetches the tags that will get pushed to the remote repository (it does a network request).
 *
 * @param repository  - The repository in which to check for unpushed tags
 * @param account     - The account to use when authenticating with the remote
 * @param remote      - The remote to check for unpushed tags
 * @param branchName  - The branch that will be used on the push command
 */
export async function fetchTagsToPush(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  branchName: string
): Promise<ReadonlyArray<string>> {
  const networkArguments = await gitNetworkArguments(repository, account)

  const args = [
    ...networkArguments,
    'push',
    remote.name,
    branchName,
    '--follow-tags',
    '--dry-run',
    '--porcelain',
  ]

  const result = await git(args, repository.path, 'fetchTagsToPush', {
    env: await envForRemoteOperation(account, remote.url),
  })

  const lines = result.stdout.split('\n')
  let currentLine = 1
  const unpushedTags = []

  while (lines[currentLine] !== 'Done') {
    const line = lines[currentLine]
    const parts = line.split('\t')

    if (parts[0] === '*' && parts[2] === '[new tag]') {
      const [tagName] = parts[1].split(':')

      if (tagName !== undefined) {
        unpushedTags.push(tagName.replace(/^refs\/tags\//, ''))
      }
    }

    currentLine++
  }

  return unpushedTags
}
