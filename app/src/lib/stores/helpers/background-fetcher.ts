import { Repository } from '../../../models/repository'
import { GitHubRepository } from '../../../models/github-repository'
import { API, getAccountForEndpoint } from '../../api'
import { fatalError } from '../../fatal-error'
import { AccountsStore } from '../accounts-store'

/**
 * A default interval at which to automatically fetch repositories, if the
 * server doesn't specify one or the header is malformed.
 */
const DefaultFetchInterval = 1000 * 60 * 60

/**
 * A minimum fetch interval, to protect against the server accidentally sending
 * us a crazy value.
 */
const MinimumInterval = 1000 * 5 * 60

/**
 * An upper bound to the skew that should be applied to the fetch interval to
 * prevent clients from accidentally syncing up.
 */
const SkewUpperBound = 30 * 1000

/** The class which handles doing background fetches of the repository. */
export class BackgroundFetcher {
  /** The handle for our setTimeout invocation. */
  private timeoutHandle: number | null = null

  /** Flag to indicate whether `stop` has been called. */
  private stopped = false

  public constructor(
    private readonly repository: Repository,
    private readonly accountsStore: AccountsStore,
    private readonly fetch: (repository: Repository) => Promise<void>,
    private readonly shouldPerformFetch: (
      repository: Repository
    ) => Promise<boolean>
  ) {}

  /** Start background fetching. */
  public start(withInitialSkew: boolean) {
    if (this.stopped) {
      fatalError('Cannot start a background fetcher that has been stopped.')
    }

    const gitHubRepository = this.repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    if (withInitialSkew) {
      this.timeoutHandle = window.setTimeout(
        () => this.performAndScheduleFetch(gitHubRepository),
        skewInterval()
      )
    } else {
      this.performAndScheduleFetch(gitHubRepository)
    }
  }

  /**
   * Stop background fetching. Once this is called, the fetcher cannot be
   * restarted.
   */
  public stop() {
    this.stopped = true

    const handle = this.timeoutHandle
    if (handle) {
      window.clearTimeout(handle)
      this.timeoutHandle = null
    }
  }

  /** Perform a fetch and schedule the next one. */
  private async performAndScheduleFetch(
    repository: GitHubRepository
  ): Promise<void> {
    if (this.stopped) {
      return
    }

    const shouldFetch = await this.shouldPerformFetch(this.repository)

    if (this.stopped) {
      return
    }

    if (shouldFetch) {
      try {
        await this.fetch(this.repository)
      } catch (e) {
        const ghRepo = this.repository.gitHubRepository
        const repoName =
          ghRepo !== null ? ghRepo.fullName : this.repository.name

        log.error(`Error performing periodic fetch for '${repoName}'`, e)
      }
    }

    if (this.stopped) {
      return
    }

    const interval = await this.getFetchInterval(repository)
    if (this.stopped) {
      return
    }

    this.timeoutHandle = window.setTimeout(
      () => this.performAndScheduleFetch(repository),
      interval
    )
  }

  /** Get the allowed fetch interval from the server. */
  private async getFetchInterval(
    repository: GitHubRepository
  ): Promise<number> {
    const account = getAccountForEndpoint(
      await this.accountsStore.getAll(),
      repository.endpoint
    )

    let interval = DefaultFetchInterval

    if (account) {
      const api = API.fromAccount(account)

      try {
        const pollInterval = await api.getFetchPollInterval(
          repository.owner.login,
          repository.name
        )
        if (pollInterval) {
          interval = Math.max(pollInterval, MinimumInterval)
        } else {
          interval = DefaultFetchInterval
        }
      } catch (e) {
        log.error('Error fetching poll interval', e)
      }
    }

    return interval + skewInterval()
  }
}

let _skewInterval: number | null = null

/**
 * The milliseconds by which the fetch interval should be skewed, to prevent
 * clients from accidentally syncing up.
 */
function skewInterval(): number {
  if (_skewInterval !== null) {
    return _skewInterval
  }

  // We don't need cryptographically secure random numbers for
  // the skew. Pseudo-random should be just fine.
  // eslint-disable-next-line insecure-random
  const skew = Math.ceil(Math.random() * SkewUpperBound)
  _skewInterval = skew
  return skew
}
