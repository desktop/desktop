import { git, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { IGitAccount } from '../../models/git-account'
import { IRemote } from '../../models/remote'
import { withTrampolineEnvForRemoteOperation } from '../trampoline/trampoline-environment'

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
 * Delete a tag.
 *
 * @param repository        - The repository in which to create the new tag.
 * @param name              - The name of the tag to delete.
 */
export async function deleteTag(
  repository: Repository,
  name: string
): Promise<void> {
  const args = ['tag', '-d', name]

  await git(args, repository.path, 'deleteTag')
}

/**
 * Gets all the local tags. Returns a Map with the tag name and the commit it points to.
 *
 * @param repository    The repository in which to get all the tags from.
 */
export async function getAllTags(
  repository: Repository
): Promise<Map<string, string>> {
  const args = ['show-ref', '--tags', '-d']

  const tags = await git(args, repository.path, 'getAllTags', {
    successExitCodes: new Set([0, 1]), // when there are no tags, git exits with 1.
  })

  const tagsArray: Array<[string, string]> = tags.stdout
    .split('\n')
    .filter(line => line !== '')
    .map(line => {
      const [commitSha, rawTagName] = line.split(' ')

      // Normalize tag names by removing the leading ref/tags/ and the trailing ^{}.
      //
      // git show-ref returns two entries for annotated tags:
      // deadbeef refs/tags/annotated-tag
      // de510b99 refs/tags/annotated-tag^{}
      //
      // The first entry sha correspond to the blob object of the annotation, while the second
      // entry corresponds to the actual commit where the tag was created.
      // By normalizing the tag name we can make sure that the commit sha gets stored in the returned
      // Map of commits (since git will always print the entry with the commit sha at the end).
      const tagName = rawTagName
        .replace(/^refs\/tags\//, '')
        .replace(/\^\{\}$/, '')

      return [tagName, commitSha]
    })

  return new Map(tagsArray)
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
    '--no-verify',
    '--porcelain',
  ]

  const result = await withTrampolineEnvForRemoteOperation(
    account,
    remote.url,
    env => {
      return git(args, repository.path, 'fetchTagsToPush', {
        env,
        successExitCodes: new Set([0, 1, 128]),
      })
    }
  )

  if (result.exitCode !== 0 && result.exitCode !== 1) {
    // Only when the exit code of git is 0 or 1, its stdout is parseable.
    // In other cases, we just rethrow the error so our memoization layer
    // doesn't cache it indefinitely.
    throw result.gitError
  }

  const lines = result.stdout.split('\n')
  let currentLine = 1
  const unpushedTags = []

  // the last line of this porcelain command is always 'Done'
  while (currentLine < lines.length && lines[currentLine] !== 'Done') {
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
