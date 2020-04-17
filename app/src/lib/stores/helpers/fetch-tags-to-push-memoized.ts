import memoizeOne from 'memoize-one'
import { fetchTagsToPush } from '../../git'
import { Repository } from '../../../models/repository'
import { IGitAccount } from '../../../models/git-account'
import { IRemote } from '../../../models/remote'

type MemoizedFetchTagsArguments = Parameters<typeof fetchTagsToMemoize>

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
 */
export const fetchTagsToPushMemoized = memoizeOne(fetchTagsToMemoize, ((
  newArgs: MemoizedFetchTagsArguments,
  lastArgs: MemoizedFetchTagsArguments
) => {
  // When forceFetch is true, we consider the arguments different to
  // force a call to the original method.
  if (newArgs[5].forceFetch) {
    return false
  }

  return serializeArguments(newArgs) === serializeArguments(lastArgs)
}) as any)

/**
 * Temporary function to use on the memoization to make typescript happy.
 *
 * @param repository  - The repository in which to check for unpushed tags
 * @param account     - The account to use when authenticating with the remote
 * @param remote      - The remote to check for unpushed tags
 * @param branchName  - The branch that will be used on the push command
 * @param _localTags  - The current list of local tags. This is only used for memoization.
 * @param _options    - Pass {forceFetch: true} to disable the memoization.
 */
function fetchTagsToMemoize(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  branchName: string,
  _localTags: ReadonlyArray<string>, // only used for cache invalidation.
  _options: { forceFetch: boolean } // only used for cache invalidation.
) {
  return fetchTagsToPush(repository, account, remote, branchName)
}

/**
 * Helper that creates a serializable value for the memoization
 * based on the function arguments.
 *
 * @param arguments  - Array with the arguments that are used for memoization.
 */
function serializeArguments([
  repository,
  account,
  remote,
  branchName,
  localTags,
]: MemoizedFetchTagsArguments) {
  return JSON.stringify([
    repository.hash,
    account ? [account.endpoint, account.login] : null,
    remote.url,
    branchName,
    localTags,
  ])
}
