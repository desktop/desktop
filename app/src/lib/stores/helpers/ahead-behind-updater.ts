const queue: (config: QueueConfig) => Queue = require('queue')
import { revSymmetricDifference } from '../../../lib/git'

// eslint-disable-next-line typescript/interface-name-prefix
interface QueueConfig {
  // Max number of jobs the queue should process concurrently, defaults to Infinity.
  readonly concurrency: number
  // Ensures the queue is always running if jobs are available.
  // Useful in situations where you are using a queue only for concurrency control.
  readonly autostart: boolean
}

// eslint-disable-next-line typescript/interface-name-prefix
interface Queue extends NodeJS.EventEmitter {
  readonly length: number

  start(): void
  end(): void
  push<T>(
    func: (callback: (error: Error | null, result: T) => void) => void
  ): void
}

import { Repository } from '../../../models/repository'
import { getAheadBehind } from '../../../lib/git'
import { Branch, IAheadBehind } from '../../../models/branch'
import {
  AheadBehindEmitter,
  ScheduleEvent,
  CacheInsertEvent,
} from '../ahead-behind-emitter'
import { Disposable } from 'event-kit'

export function getAheadBehindCacheKey(from: string, to: string) {
  return revSymmetricDifference(from, to)
}

export class AheadBehindUpdater {
  private aheadBehindQueue = queue({
    concurrency: 1,
    autostart: true,
  })

  private readonly cache = new Map<string, IAheadBehind>()
  private readonly subscription: Disposable

  public constructor(
    private readonly repository: Repository,
    private readonly emitter: AheadBehindEmitter
  ) {
    log.debug(
      `[AheadBehindUpdater] - subscribing to events for ${this.repository.name}`
    )

    const insertDisposable = emitter.onInsertValue(event => {
      this.insert(event)
    })

    const scheduleDisposable = emitter.onScheduleComparisons(event => {
      this.schedule(event)
    })

    const pauseDisposable = emitter.onPause(() => {
      this.clear()
    })

    this.subscription = new Disposable(() => {
      log.debug(
        `[AheadBehindUpdater] - disposing subscriptions for ${
          this.repository.name
        }`
      )
      insertDisposable.dispose()
      scheduleDisposable.dispose()
      pauseDisposable.dispose()
      this.cache.clear()
    })
  }

  public start() {
    this.aheadBehindQueue.on('success', (result: IAheadBehind | null) => {
      if (result != null) {
        this.emitter.fireUpdate({
          repository: this.repository,
          aheadBehindCache: this.cache,
        })
      }
    })

    this.aheadBehindQueue.on('error', (err: Error) => {
      log.debug(
        '[AheadBehindUpdater] an error with the queue was reported',
        err
      )
    })

    this.aheadBehindQueue.on('end', (err?: Error) => {
      if (err != null) {
        log.debug(`[AheadBehindUpdater] ended with an error`, err)
      }
    })

    this.aheadBehindQueue.start()
  }

  public stop() {
    this.aheadBehindQueue.end()
    this.subscription.dispose()
  }

  private executeTask = (
    from: string,
    to: string,
    callback: (error: Error | null, result: IAheadBehind | null) => void
  ) => {
    const cacheKey = getAheadBehindCacheKey(from, to)
    if (this.cache.has(cacheKey)) {
      return
    }

    const range = revSymmetricDifference(from, to)
    getAheadBehind(this.repository, range).then(result => {
      if (result != null) {
        this.cache.set(cacheKey, result)
      } else {
        log.debug(
          `[AheadBehindUpdater] unable to cache '${range}' as no result returned`
        )
      }
      callback(null, result)
    })
  }

  private insert(event: CacheInsertEvent) {
    const { from, to, aheadBehind } = event
    const key = getAheadBehindCacheKey(from, to)

    if (this.cache.has(key)) {
      return
    }

    this.cache.set(key, aheadBehind)
  }

  /**
   * Stop any pending ahead/behind computations for the current repository
   */
  private clear() {
    log.debug(
      `[AheadBehindUpdater] - abandoning ${
        this.aheadBehindQueue.length
      } pending comparisons`
    )

    this.aheadBehindQueue.end()
  }

  /**
   * Schedule ahead/behind computations for all available branches in
   * the current repository, where they haven't been already computed
   *
   * @param currentBranch The current branch of the repository
   * @param defaultBranch The default branch (if defined)
   * @param recentBranches Recent branches in the repository
   * @param allBranches All known branches in the repository
   */
  private schedule(event: ScheduleEvent) {
    this.clear()

    const { currentBranch, defaultBranch, recentBranches, allBranches } = event

    const from = currentBranch.tip.sha

    const filterBranchesNotInCache = (branches: ReadonlyArray<Branch>) => {
      return branches
        .map(b => b.tip.sha)
        .filter(to => !this.cache.has(getAheadBehindCacheKey(from, to)))
    }

    const otherBranches = [...recentBranches, ...allBranches]

    const branches =
      defaultBranch !== null ? [defaultBranch, ...otherBranches] : otherBranches

    const newRefsToCompare = new Set<string>(filterBranchesNotInCache(branches))

    log.debug(
      `[AheadBehindUpdater] - found ${
        newRefsToCompare.size
      } comparisons to perform`
    )

    for (const sha of newRefsToCompare) {
      this.aheadBehindQueue.push<IAheadBehind | null>(callback =>
        requestIdleCallback(() => {
          this.executeTask(from, sha, callback)
        })
      )
    }
  }
}
