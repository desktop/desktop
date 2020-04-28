import { fetchTagsToPush } from '../../git'
import { Repository } from '../../../models/repository'
import { IGitAccount } from '../../../models/git-account'
import { IRemote } from '../../../models/remote'
import LRUCache = require('lru-cache')

const cache = new Map<string, LRUCache<string, ReadonlyArray<string>>>()

const MaxCacheEntriesToStorePerRepository = 25

/**
 * How long do we want to cache errors received from git?
 */
const MaxAgeForCachedErrors = 5 * 60 * 1000 // 5 minutes.

/**
 * Memoized version of the fetchTagsToPush git method.
 *
 * This method will return a cached result of the tags array when called multiple
 * times with the same arguments. This is done to avoid doing too many network
 * requests.
 *
 * @param repository  - The repository in which to check for unpushed tags
 * @param account     - The account to use when authenticating with the remote
 * @param remote      - The remote to check for unpushed tags
 * @param branchName  - The branch that will be used on the push command
 * @param localTags   - The current list of local tags. This is only used for memoization
 * @param currentTipSha - The sha of the current HEAD commit. This is only used for memoization
 */
export async function fetchTagsToPushMemoized(
  repository: Repository,
  account: IGitAccount | null,
  remote: IRemote,
  branchName: string,
  localTags: Map<string, string>,
  currentTipSha: string
) {
  const key = serializeArguments(branchName, localTags, currentTipSha)

  let cachedTagsToPush = cache.get(remote.name)
  let result = cachedTagsToPush && cachedTagsToPush.get(key)

  if (result === undefined) {
    let maxAge = undefined

    try {
      result = await fetchTagsToPush(repository, account, remote, branchName)
    } catch (e) {
      // If we receive an error from git, return an empty result and only
      // cache it for a short amount of time.
      result = []
      maxAge = MaxAgeForCachedErrors
    }

    // Store the returned result in the cache.
    cachedTagsToPush =
      cachedTagsToPush ||
      new LRUCache<string, ReadonlyArray<string>>({
        max: MaxCacheEntriesToStorePerRepository,
      })

    cachedTagsToPush.set(key, result, maxAge)
    cache.set(remote.name, cachedTagsToPush)
  }

  return result
}

/**
 * Clear the cache for the passed remote.
 *
 * @param remote Remote repository object.
 */
export function clearTagsToPushCache(remote: IRemote | null) {
  if (remote === null) {
    return
  }

  const remoteCache = cache.get(remote.name)
  if (remoteCache) {
    remoteCache.reset()
  }
}

/**
 * Helper that creates a serializable value for the memoization
 * based on the function arguments.
 *
 * @param branchName  - The branch that will be used on the push command
 * @param localTags   - The current list of local tags
 * @param currentTipSha - The sha of the current HEAD commit
 */
function serializeArguments(
  branchName: string,
  localTags: Map<string, string>,
  currentTipSha: string
) {
  return JSON.stringify([branchName, Array.from(localTags), currentTipSha])
}
