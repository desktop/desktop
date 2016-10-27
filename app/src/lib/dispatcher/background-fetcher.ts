import { Repository } from '../../models/repository'
import { User } from '../../models/user'
import { GitHubRepository } from '../../models/github-repository'
import { API } from '../api'
import { fatalError } from '../fatal-error'

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
 *
 * This interval has millisecond resolution.
 */
const SkewUpperBound = 30

/** The class which handles doing background fetches of the repository. */
export class BackgroundFetcher {
  private readonly repository: Repository
  private readonly user: User

  /** The handle for our setTimeout invocation. */
  private timeoutHandle: NodeJS.Timer | null = null

  /**
   * The last received Etag for the `refs` endpoint, which is used to determine
   * the fetch interval.
   */
  private refsEtag: string | null = null

  /** Flag to indicate whether `stop` has been called. */
  private stopped = false

  public constructor(repository: Repository, user: User) {
    this.repository = repository
    this.user = user
  }

  /** Start background fetching. */
  public start() {
    if (this.stopped) {
      fatalError('Cannot start a background fetcher that has been stopped.')
      return
    }

    const gitHubRepository = this.repository.gitHubRepository
    if (!gitHubRepository) { return }

    this.performAndScheduleFetch(gitHubRepository)
  }

  /**
   * Stop background fetching. Once this is called, the fetcher cannot be
   * restarted.
   */
  public stop() {
    this.stopped = true

    const handle = this.timeoutHandle
    if (handle) {
      clearTimeout(handle)
      this.timeoutHandle = null
    }
  }

  /** Perform a fetch and schedule the next one. */
  private async performAndScheduleFetch(repository: GitHubRepository): Promise<void> {
    await this.fetch()
    if (this.stopped) { return }

    const interval = await this.getFetchInterval(repository)
    if (this.stopped) { return }

    this.timeoutHandle = setTimeout(() => this.performAndScheduleFetch(repository), interval)
  }

  /** Get the allowed fetch interval from the server. */
  private async getFetchInterval(repository: GitHubRepository): Promise<number> {
    const api = new API(this.user)

    let interval = DefaultFetchInterval
    try {
      const response = await api.getPollInterval(repository.owner.login, repository.name, this.refsEtag)
      interval = Math.max(response.pollInterval, MinimumInterval)
      this.refsEtag = response.etag
    } catch (e) {
      console.error('Error fetching poll interval:')
      console.error(e)
    }


    return interval + skewInterval()
  }

  /** Perform a fetch. */
  private async fetch() {

  }
}

let _skewInterval: number | null = null

/**
 * The amount by which the fetch interval should be skewed, to prevent clients
 * from accidentally syncing up.
 */
function skewInterval(): number {
  if (_skewInterval !== null) {
    return _skewInterval!
  }

  const byteArray = new Uint32Array(1)
  crypto.getRandomValues(byteArray)

  const n = byteArray[0]
  const skew = n % SkewUpperBound
  _skewInterval = skew
  return skew
}
