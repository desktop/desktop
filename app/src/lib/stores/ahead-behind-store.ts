import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'
import { IDisposable, Disposable } from 'event-kit'
import { IAheadBehind } from '../../models/branch'
import { revSymmetricDifference, getAheadBehind } from '../git'
import { Repository } from '../../models/repository'

export type AheadBehindCallback = (aheadBehind: IAheadBehind) => void

/** Creates a cache key for a particular commit range in a specific repository */
function getCacheKey(repository: Repository, from: string, to: string) {
  return `${repository.path}:${from}:${to}`
}

/**
 * The maximum number of _concurrent_ `git rev-list` operations we'll run. We're
 * gonna play it safe and stick to no concurrent operations initially since
 * that's how the previous ahead/behind logic worked but it should be safe to
 * bump this to 3 or so to squeeze some more performance out of it.
 */
const MaxConcurrent = 1

export class AheadBehindStore {
  /**
   * A map keyed on the value of `getCacheKey` containing one object per
   * reference (repository specific) with the last retrieved ahead behind status
   * for that reference.
   *
   * This map also functions as a least recently used cache and will evict the
   * least recently used comparisons to ensure the cache won't grow unbounded
   */
  private readonly cache = new QuickLRU<string, IAheadBehind | null>({
    maxSize: 2500,
  })

  /** Currently executing workers. Contains at most `MaxConcurrent` workers */
  private readonly workers = new Map<string, Promise<IAheadBehind | null>>()

  /**
   * A concurrency limiter which ensures that we only run `MaxConcurrent`
   * ahead/behind calculations concurrently
   */
  private readonly limit = pLimit(MaxConcurrent)

  /**
   * Attempt to _synchronously_ retrieve an ahead behind status for a particular
   * range. If the range doesn't exist in the cache this function returns
   * undefined.
   *
   * Useful for component who wish to have a value for the initial render
   * instead of waiting for the subscription to produce an event.
   *
   * Note that while it's technically possible to use refs or revision
   * expressions instead of commit ids here it's strongly recommended against as
   * the store has no way of knowing when these refs are updated. Using oids
   * means we can rely on the ids themselves for invalidation.
   */
  public tryGetAheadBehind(repository: Repository, from: string, to: string) {
    return this.cache.get(getCacheKey(repository, from, to)) ?? undefined
  }

  /**
   * Subscribe to the result of calculating the ahead behind status for the
   * given range. The operation can be aborted using the returned Disposable.
   *
   * Aborting means that the callback won't execute and if that we'll try to
   * avoid invoking Git unless we've already done so or there's another caller
   * requesting that calculation. Aborting after the callback has been invoked
   * is a no-op.
   *
   * The callback will not fire if we were unsuccessful in calculating the
   * ahead/behind status.
   */
  public getAheadBehind(
    repository: Repository,
    from: string,
    to: string,
    callback: AheadBehindCallback
  ): IDisposable {
    const key = getCacheKey(repository, from, to)
    const existing = this.cache.get(key)
    const disposable = new Disposable(() => {})

    // We failed loading on the last attempt in which case we won't retry
    if (existing === null) {
      return disposable
    }

    if (existing !== undefined) {
      callback(existing)
      return disposable
    }

    this.limit(async () => {
      const existing = this.cache.get(key)

      // The caller has either aborted or we've previously failed loading ahead/
      // behind status for this ref pair. We don't retry previously failed ops
      if (disposable.disposed || existing === null) {
        return
      }

      if (existing !== undefined) {
        callback(existing)
        return
      }

      let worker = this.workers.get(key)

      if (worker === undefined) {
        worker = getAheadBehind(repository, revSymmetricDifference(from, to))
          .catch(e => {
            log.error('Failed calculating ahead/behind status', e)
            return null
          })
          .then(aheadBehind => {
            this.cache.set(key, aheadBehind)
            return aheadBehind
          })
          .finally(() => this.workers.delete(key))

        this.workers.set(key, worker)
      }

      const aheadBehind = await worker

      if (aheadBehind !== null && !disposable.disposed) {
        callback(aheadBehind)
      }
    }).catch(e => log.error('Failed calculating ahead/behind status', e))

    return disposable
  }
}
