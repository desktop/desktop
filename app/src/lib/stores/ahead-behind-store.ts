import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'
import { IDisposable, Disposable } from 'event-kit'
import { IAheadBehind } from '../../models/branch'
import { revSymmetricDifference, getAheadBehind } from '../git'
import { Repository } from '../../models/repository'

export type AheadBehindCallback = (aheadBehind: IAheadBehind) => void

interface IAheadBehindSubscription {
  readonly repository: Repository
  readonly from: string
  readonly to: string

  /**
   * One or more callbacks to notify when the ahead/behind status between the
   * two references has been calculated
   */
  readonly callbacks: Set<AheadBehindCallback>
}

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
   * A map keyed on the value of `getCacheKey` containing one object per active
   * subscription which contain all the information required to update an ahead
   * behind status and notify subscribers.
   */
  private readonly subscriptions = new Map<string, IAheadBehindSubscription>()

  /**
   * A map keyed on the value of `getCacheKey` containing one object per
   * reference (repository specific) with the last retrieved ahead behind status
   * for that reference.
   *
   * This map also functions as a least recently used cache and will evict the
   * least recently used comparisons to ensure the cache won't grow unbounded
   */
  private readonly cache = new QuickLRU<string, IAheadBehind>({ maxSize: 2500 })

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

    if (aheadBehind !== null) {
      this.cache.set(key, aheadBehind)
      subscription.callbacks.forEach(cb => cb(aheadBehind))
    }
  }

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
    return this.cache.get(getCacheKey(repository, from, to))
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
   * Subscribe to the result of calculating the ahead behind status for the
   * given range.
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
        .finally(() => this.queue.delete(key))

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
