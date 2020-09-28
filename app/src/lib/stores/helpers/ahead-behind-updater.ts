import queue from 'queue'
import { revSymmetricDifference } from '../../../lib/git'
import { Repository } from '../../../models/repository'
import { getAheadBehind } from '../../../lib/git'
import { Branch, IAheadBehind } from '../../../models/branch'
import { ComparisonCache } from '../../comparison-cache'

export class AheadBehindUpdater {
  private comparisonCache = new ComparisonCache()

  private aheadBehindQueue = queue({
    concurrency: 1,
    autostart: true,
  })

  public constructor(
    private repository: Repository,
    private onCacheUpdate: (cache: ComparisonCache) => void
  ) {}

  public start() {
    this.aheadBehindQueue.on('success', (result: IAheadBehind | null) => {
      if (result != null) {
        this.onCacheUpdate(this.comparisonCache)
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
  }

  public async executeAsyncTask(
    from: string,
    to: string
  ): Promise<IAheadBehind | null> {
    if (this.comparisonCache.has(from, to)) {
      return this.comparisonCache.get(from, to)
    }

    const range = revSymmetricDifference(from, to)
    const result = await getAheadBehind(this.repository, range)

    if (result !== null) {
      this.comparisonCache.set(from, to, result)
    } else {
      log.debug(
        `[AheadBehindUpdater] unable to cache '${range}' as no result returned`
      )
    }

    return result
  }

  public insert(from: string, to: string, value: IAheadBehind) {
    if (this.comparisonCache.has(from, to)) {
      return
    }

    this.comparisonCache.set(from, to, value)
  }

  /**
   * Stop processing any ahead/behind computations for the current repository
   */
  public clear() {
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
  public schedule(
    currentBranch: Branch,
    defaultBranch: Branch | null,
    recentBranches: ReadonlyArray<Branch>,
    allBranches: ReadonlyArray<Branch>
  ) {
    this.clear()

    const from = currentBranch.tip.sha

    const filterBranchesNotInCache = (branches: ReadonlyArray<Branch>) => {
      return branches
        .map(b => b.tip.sha)
        .filter(to => !this.comparisonCache.has(from, to))
    }

    const otherBranches = [...recentBranches, ...allBranches]

    const branches =
      defaultBranch !== null ? [defaultBranch, ...otherBranches] : otherBranches

    const newRefsToCompare = new Set<string>(filterBranchesNotInCache(branches))

    log.debug(
      `[AheadBehindUpdater] - found ${newRefsToCompare.size} comparisons to perform`
    )

    for (const sha of newRefsToCompare) {
      this.aheadBehindQueue.push(
        () =>
          new Promise<IAheadBehind | null>((resolve, reject) => {
            requestIdleCallback(() => {
              this.executeAsyncTask(from, sha).then(resolve, reject)
            })
          })
      )
    }
  }
}
