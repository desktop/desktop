import { fetchTagsToPush } from '../../git'
import { Repository } from '../../../models/repository'
import { IGitAccount } from '../../../models/git-account'
import { IRemote } from '../../../models/remote'

type MemoizedFetchTagsArguments = Parameters<typeof fetchTagsToPushMemoized>

const cachedTagsToPush = new Map<string, ReadonlyArray<string>>()

/**
 * Memoized version of the fetchTagsToPush git method.
 *
 * This method will return a cached result of the tags array when called multiple
 * times with the same arguments, this is done to avoid doing too many network
 * requests.
 *
 * @param repository  - The repository in which to check for unpushed tags
 * @param account     - The account to use when authenticating with the remote
 * @param remote      - The remote to check for unpushed tags
 * @param branchName  - The branch that will be used on the push command
 * @param localTags   - The current list of local tags. This is only used for memoization purposes
 * @param currentTipSha - The sha of the current HEAD commit. This is only used for memoization
 * @param options       - Pass {forceFetch: true} to disable the memoization
 */
export async function fetchTagsToPushMemoized(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  branchName: string,
  localTags: ReadonlyArray<string>,
  currentTipSha: string,
  options: { forceFetch: boolean }
) {
  const key = serializeArguments([
    repository,
    account,
    remote,
    branchName,
    localTags,
    currentTipSha,
    options,
  ])

  let result = cachedTagsToPush.get(key)

  if (options.forceFetch || !result) {
    result = await fetchTagsToPush(repository, account, remote, branchName)
    cachedTagsToPush.set(key, result)
  }

  return result
}

/**
 * Helper that creates a serializable value for the memoization
 * based on the function arguments.
 *
 * @param arguments  - Array with the arguments that are used for memoization.
 */
function serializeArguments([
  _repository, // the local repository doesn't alter the output of fetchTags()
  _account, // the used account doesn't alter the output of fetchTags()
  remote,
  branchName,
  localTags,
  currentTipSha,
]: MemoizedFetchTagsArguments) {
  return JSON.stringify([remote.url, branchName, localTags, currentTipSha])
}
