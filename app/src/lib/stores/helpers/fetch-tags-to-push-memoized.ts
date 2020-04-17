import memoizeOne from 'memoize-one'
import { fetchTagsToPush } from '../../git'

type FetchTagsArguments = Parameters<typeof fetchTagsToPush>
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
export const fetchTagsToPushMemoized = memoizeOne(
  fetchTagsToMemoize,
  (newArgs, lastArgs) =>
    serializeArguments(newArgs as MemoizedFetchTagsArguments) ===
    serializeArguments(lastArgs as MemoizedFetchTagsArguments)
)

/**
 * Temporary function to use on the memoization to make typescript happy.
 *
 * @param _localTags - The current list of local tags. This is only used for memoization.
 * @param fetchTagsArguments - The original arguments of the fetchTagsToPush() method.
 */
function fetchTagsToMemoize(
  _localTags: ReadonlyArray<string>, // only used for cache invalidation.
  ...fetchTagsArguments: FetchTagsArguments
) {
  return fetchTagsToPush(...fetchTagsArguments)
}

/**
 * Helper that creates a serializable value for the memoization
 * based on the function arguments.
 *
 * @param arguments  - Array with the arguments that are used for memoization.
 */
function serializeArguments([
  localTags,
  repository,
  account,
  remote,
  branchName,
]: MemoizedFetchTagsArguments) {
  return JSON.stringify([
    repository.hash,
    account ? [account.endpoint, account.login] : null,
    remote.url,
    branchName,
    localTags,
  ])
}
