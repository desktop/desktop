import { Repository } from '../../../models/repository'

/**
 * Refresh repository indicators every 15 minutes.
 */
const RefreshInterval = 15 * 60 * 1000

/**
 * An upper bound to the skew that should be applied to the fetch interval to
 * prevent clients from accidentally syncing up.
 */
const SkewUpperBound = 30 * 1000

// We don't need cryptographically secure random numbers for
// the skew. Pseudo-random should be just fine.
// eslint-disable-next-line insecure-random
const skew = Math.ceil(Math.random() * SkewUpperBound)

export class RepositoryIndicatorUpdater {
  private running = false
  private refreshTimeoutId: number | null = null
  private paused = false
  private pausePromise: Promise<void> = Promise.resolve()
  private resolvePausePromise: (() => void) | null = null
  private lastRefreshStartedAt: number | null = null

  public constructor(
    private readonly getRepositories: () => ReadonlyArray<Repository>,
    private readonly refreshRepositoryIndicators: (
      repository: Repository
    ) => Promise<void>
  ) {}

  public start() {
    if (!this.running) {
      this.debug('Starting')

      this.running = true
      this.scheduleRefresh()
    }
  }

  private scheduleRefresh() {
    if (this.running && this.refreshTimeoutId === null) {
      const timeSinceLastRefresh =
        this.lastRefreshStartedAt === null
          ? Infinity
          : Date.now() - this.lastRefreshStartedAt

      const timeout = Math.max(RefreshInterval - timeSinceLastRefresh, 0) + skew
      const lastRefreshText = isFinite(timeSinceLastRefresh)
        ? `${(timeSinceLastRefresh / 1000).toFixed(3)}s ago`
        : 'never'
      const timeoutText = `${(timeout / 1000).toFixed(3)}s`

      this.debug(
        `Last refresh: ${lastRefreshText}, scheduling in ${timeoutText}`
      )

      this.refreshTimeoutId = window.setTimeout(
        () => this.refreshAllRepositories(),
        timeout
      )
    }
  }

  private async refreshAllRepositories() {
    // We're only ever called by the setTimout so it's safe for us to clear
    // this without calling clearTimeout
    this.refreshTimeoutId = null
    this.debug('Running refreshAllRepositories')
    if (this.paused) {
      this.debug('Paused before starting refreshAllRepositories')
      await this.pausePromise

      if (!this.running) {
        return
      }
    }

    this.lastRefreshStartedAt = Date.now()

    let repository
    const done = new Set<number>()
    const getNextRepository = () =>
      this.getRepositories().find(x => !done.has(x.id))

    const startTime = Date.now()
    let pausedTime = 0

    while (this.running && (repository = getNextRepository()) !== undefined) {
      await this.refreshRepositoryIndicators(repository)

      if (this.paused) {
        this.debug(`Pausing after ${done.size} repositories`)
        const pauseTimeStart = Date.now()
        await this.pausePromise
        pausedTime += Date.now() - pauseTimeStart
        this.debug(`Resuming after ${pausedTime / 1000}s`)
      }

      done.add(repository.id)
    }

    if (done.size >= 1) {
      const totalTime = Date.now() - startTime
      const activeTime = totalTime - pausedTime
      const activeTimeSeconds = (activeTime / 1000).toFixed(1)
      const pausedTimeSeconds = (pausedTime / 1000).toFixed(1)
      const totalTimeSeconds = (totalTime / 1000).toFixed(1)

      this.info(
        `${RepositoryIndicatorUpdater.name}: Refreshing sidebar indicators for ${done.size} repositories took ${activeTimeSeconds}s of which ${pausedTimeSeconds}s paused, total ${totalTimeSeconds}s`
      )
    }

    this.scheduleRefresh()
  }

  private clearRefreshTimeout() {
    if (this.refreshTimeoutId !== null) {
      window.clearTimeout()
      this.refreshTimeoutId = null
    }
  }

  public stop() {
    if (this.running) {
      this.debug('Stopping')
      this.running = false
      this.clearRefreshTimeout()
    }
  }

  public pause() {
    if (this.paused === false) {
      this.debug('Pausing')

      // Disable the lint warning since we're storing the `resolve`
      // tslint:disable-next-line:promise-must-complete
      this.pausePromise = new Promise<void>(resolve => {
        this.resolvePausePromise = resolve
        this.paused = true
      })
    }
  }

  public resume() {
    if (this.paused) {
      this.debug('Resuming')

      this.pausePromise = Promise.resolve()
      if (this.resolvePausePromise !== null) {
        this.resolvePausePromise()
        this.resolvePausePromise = null
      }

      this.paused = false
    }
  }

  private debug(message: string) {
    log.debug(`${RepositoryIndicatorUpdater.name}: ${message}`)
  }

  private info(message: string) {
    log.info(`${RepositoryIndicatorUpdater.name}: ${message}`)
  }
}
