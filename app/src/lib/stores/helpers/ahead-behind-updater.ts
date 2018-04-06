const queue: (config: QueueConfig) => Queue = require('queue')

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
import { ComparisonCache } from '../../comparison-cache'

export class AheadBehindUpdater {
  private comparisonCache = new ComparisonCache()

  private q = queue({
    concurrency: 1,
    autostart: true,
  })

  public constructor(
    private repository: Repository,
    private onPerformingWork: (working: boolean) => void,
    private onCacheUpdate: (cache: ComparisonCache) => void
  ) {}

  public start() {
    this.q.on('success', (result: IAheadBehind | null, job: any) => {
      if (result != null) {
        this.onCacheUpdate(this.comparisonCache)
      }
    })

    this.q.on('error', (err: Error) => {
      log.error(
        '[AheadBehindUpdater] an error with the queue was reported',
        err
      )
    })

    this.q.on('end', (err?: Error) => {
      if (err != null) {
        log.warn(`[AheadBehindUpdater] ended with an error`, err)
      }

      this.onPerformingWork(false)
    })

    this.q.start()
  }

  public stop() {
    this.q.end()
  }

  private executeTask = (
    from: string,
    to: string,
    callback: (error: Error | null, result: IAheadBehind | null) => void
  ) => {
    if (this.comparisonCache.has(from, to)) {
      return
    }

    const range = `${from}...${to}`
    getAheadBehind(this.repository, range).then(result => {
      if (result != null) {
        this.comparisonCache.set(from, to, result)
      } else {
        log.debug(
          `[AheadBehindUpdater] unable to cache '${range}' as no result returned`
        )
      }
      callback(null, result)
    })
  }

  public enqueue(currentBranch: Branch, branches: ReadonlyArray<Branch>) {
    // remove any queued work to prioritize this new set of tasks
    this.q.end()

    const from = currentBranch.tip.sha

    const branchesNotInCache = branches
      .map(b => b.tip.sha)
      .filter(to => !this.comparisonCache.has(from, to))

    const newRefsToCompare = new Set<string>(branchesNotInCache)

    log.warn(
      `[AheadBehindUpdater] - found ${
        newRefsToCompare.size
      } comparisons to perform`
    )

    if (newRefsToCompare.size === 0) {
      return
    }

    this.onPerformingWork(true)

    for (const sha of newRefsToCompare) {
      this.q.push<IAheadBehind | null>(callback =>
        requestIdleCallback(() => {
          this.executeTask(from, sha, callback)
        })
      )
    }
  }
}
