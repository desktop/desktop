import { Repository } from '../../../models/repository'
import { getAheadBehind } from '../../../lib/git'
import { Branch } from '../../../models/branch'
import { ComparisonCache } from '../../comparison-cache'

export class AheadBehindUpdater {
  private comparisonCache = new ComparisonCache()
  private abortInflightRequests = false

  public constructor(
    private repository: Repository,
    private onPerformingWork: (working: boolean) => void,
    private onCacheUpdate: (cache: ComparisonCache) => void
  ) {}

  public start() {}

  public stop() {
    this.abortInflightRequests = true
  }

  private async executeBackgroundCompares(
    from: string,
    uniqueBranchSha: Set<string>
  ) {
    this.abortInflightRequests = false
    this.onPerformingWork(true)

    let count = uniqueBranchSha.size

    for (const sha of uniqueBranchSha) {
      if (this.abortInflightRequests) {
        log.debug(
          `[AheadBehindUpdater] - aborting with ${count} branches unresolved`
        )
        this.onPerformingWork(false)
        break
      }

      if (this.comparisonCache.has(from, sha)) {
        count -= 1
        continue
      }

      const range = `${from}...${sha}`
      const aheadBehind = await getAheadBehind(this.repository, range)

      if (aheadBehind != null) {
        this.comparisonCache.set(from, sha, aheadBehind)
        this.onCacheUpdate(this.comparisonCache)
      } else {
        log.debug(
          `[AheadBehindUpdater] unable to cache '${range}' as no result returned`
        )
      }
      count -= 1
    }

    this.onPerformingWork(false)
  }

  public enqueue(currentBranch: Branch, branches: ReadonlyArray<Branch>) {
    // signal to abandon any in-flight comparison checks
    this.abortInflightRequests = true

    const from = currentBranch.tip.sha

    const uncachedBranchShas = branches
      .map(b => b.tip.sha)
      .filter(to => !this.comparisonCache.has(from, to))

    const uniqueBranchSha = new Set<string>(uncachedBranchShas)

    log.warn(`[Compare] - found ${uniqueBranchSha.size} comparisons to perform`)

    this.executeBackgroundCompares(from, uniqueBranchSha)
  }
}
