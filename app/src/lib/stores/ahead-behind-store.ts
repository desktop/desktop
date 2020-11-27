import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'
import { IDisposable, Disposable } from 'event-kit'
import { IAheadBehind } from '../../models/branch'
import { revSymmetricDifference, getAheadBehind } from '../git'
import { Repository } from '../../models/repository'

interface IAheadBehindCacheEntry {
  /**
   * The combined ref status from the API or null if
   * the status could not be retrieved.
   */
  readonly aheadBehind: IAheadBehind | undefined
  /**
   * The timestamp for when this cache entry was last
   * fetched from the API (i.e. when it was created).
   */
  readonly fetchedAt: Date
}

export type AheadBehindCallback = (aheadBehind: IAheadBehind) => void

interface IAheadBehindSubscription {
  readonly repository: Repository
  readonly from: string
  readonly to: string

  /**
   * One or more callbacks to notify when the ahead/behind status between the
   * two references has been calculated (or updated)
   */
  readonly callbacks: Set<AheadBehindCallback>
}

/** Creates a cache key for a particular commit range in a specific repository */
function getCacheKey(repository: Repository, from: string, to: string) {
  return `${repository.path}:${from}:${to}`
}

const MaxConcurrent = 1

export class AheadBehindStore {
  /**
   * A map keyed on the value of `getCacheKey` containing one object
   * per active subscription which contain all the information required
   * to update a commit status from the API and notify subscribers.
   */
  private readonly subscriptions = new Map<string, IAheadBehindSubscription>()

  /**
   * A map keyed on the value of `getCacheKey` containing one object per
   * reference (repository specific) with the last retrieved commit status
   * for that reference.
   *
   * This map also functions as a least recently used cache and will evict
   * the least recently used comparisons to ensure the cache won't grow
   * unbounded
   */
  private readonly cache = new QuickLRU<string, IAheadBehindCacheEntry>({
    maxSize: 2500,
  })

  /**
   * A set containing the currently executing cache keys (produced by
   * `getCacheKey`).
   */
  private readonly queue = new Set<string>()

  /**
   * A concurrency limiter which ensures that we only run `MaxConcurrent`
   * ahead/behind calculations concurrently
   */
  private readonly limit = pLimit(MaxConcurrent)

  private async getAheadBehind(key: string) {
    // Make sure it's still a valid subscription that someone might care about
    const subscription = this.subscriptions.get(key)

    if (subscription === undefined) {
      return
    }

    const { repository, from, to } = subscription
    const range = revSymmetricDifference(from, to)
    const aheadBehind = await getAheadBehind(repository, range)
      .catch(e => {
        log.error(`Failed calculating ahead/behind status for ${range}`, e)
        return undefined
      })
      .then(x => x ?? undefined)

    if (aheadBehind === undefined) {
      // Okay, so we failed calculating the ahead/behind status for one reason
      // or another. That's a bummer, but we still need to put something in the
      // cache or else we'll consider this subscription eligible for refresh
      // from here on until we succeed in calculating. By putting a blank cache
      // entry (or potentially reusing the last entry) in and not notifying
      // subscribers we ensure they keep their current status if they have one
      // and that we attempt to fetch it again on the same schedule as the
      // others.
      const existingEntry = this.cache.get(key)
      const aheadBehind = existingEntry?.aheadBehind

      this.cache.set(key, { aheadBehind, fetchedAt: new Date() })
      return
    }

    this.cache.set(key, { aheadBehind: aheadBehind, fetchedAt: new Date() })
    subscription.callbacks.forEach(cb => cb(aheadBehind))
  }

  /**
   * Attempt to _synchronously_ retrieve a commit status for a particular
   * ref. If the ref doesn't exist in the cache this function returns null.
   *
   * Useful for component who wish to have a value for the initial render
   * instead of waiting for the subscription to produce an event.
   */
  public tryGetStatus(
    repository: Repository,
    from: string,
    to: string
  ): IAheadBehind | undefined {
    const key = getCacheKey(repository, from, to)
    return this.cache.get(key)?.aheadBehind
  }

  private getOrCreateSubscription(
    repository: Repository,
    from: string,
    to: string
  ) {
    const key = getCacheKey(repository, from, to)
    let subscription = this.subscriptions.get(key)

    if (subscription !== undefined) {
      return subscription
    }

    const callbacks = new Set<AheadBehindCallback>()
    subscription = { repository, from, to, callbacks }

    this.subscriptions.set(key, subscription)

    return subscription
  }

  /**
   * Subscribe to commit status updates for a particular ref.
   *
   * @param repository The GitHub repository to use when looking up commit status.
   * @param ref        The commit ref (can be a SHA or a Git ref) for which to
   *                   fetch status.
   * @param callback   A callback which will be invoked whenever the
   *                   store updates a commit status for the given ref.
   */
  public subscribe(
    repository: Repository,
    from: string,
    to: string,
    callback: AheadBehindCallback
  ): IDisposable {
    const key = getCacheKey(repository, from, to)
    const subscription = this.getOrCreateSubscription(repository, from, to)

    subscription.callbacks.add(callback)

    if (!this.cache.has(key) && !this.queue.has(key)) {
      this.limit(() => this.getAheadBehind(key))
        .catch(e => log.error('Failed calculating ahead/behind status', e))
        .then(() => this.queue.delete(key))

      this.queue.add(key)
    }

    return new Disposable(() => {
      subscription.callbacks.delete(callback)
      if (subscription.callbacks.size === 0) {
        this.subscriptions.delete(key)
      }
    })
  }
}
