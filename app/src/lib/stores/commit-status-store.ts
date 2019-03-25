import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'

import { Account } from '../../models/account'
import { AccountsStore } from './accounts-store'
import { GitHubRepository } from '../../models/github-repository'
import { API, IAPIRefStatus } from '../api'
import { IDisposable, Disposable } from 'event-kit'
import { remote, ipcRenderer } from 'electron'

interface ICommitStatusCacheEntry {
  readonly status: IAPIRefStatus | null
  readonly fetchedAt: Date
}

export type StatusCallBack = (status: IAPIRefStatus | null) => void

interface IRefStatusSubscription {
  readonly endpoint: string
  readonly owner: string
  readonly name: string
  readonly ref: string
  readonly callbacks: Set<StatusCallBack>
}

/**
 * Creates a cache key for a particular ref in a specific repository.
 *
 * Remarks: The cache key is currently the same as the canonical API status
 *          URI but that has no bearing on the functionality, it does, however
 *          help with debugging.
 *
 * @param repository The GitHub repository to use when looking up commit status.
 * @param ref        The commit ref (can be a SHA or a Git ref) for which to
 *                   fetch status.
 */
function getCacheKeyForRepository(repository: GitHubRepository, ref: string) {
  const { endpoint, owner, name } = repository
  return getCacheKey(endpoint, owner.login, name, ref)
}

/**
 * Creates a cache key for a particular ref in a specific repository.
 *
 * Remarks: The cache key is currently the same as the canonical API status
 *          URI but that has no bearing on the functionality, it does, however
 *          help with debugging.
 *
 * @param ep    The repository endpoint (for example https://api.github.com for
 *              GitHub.com and https://github.corporation.local/api for GHE)
 * @param owner The repository owner's login (desktop for desktop/desktop)
 * @param name  The repository name
 * @param ref   The commit ref (can be a SHA or a Git ref) for which to fetch
 *              status.
 */
function getCacheKey(ep: string, owner: string, name: string, ref: string) {
  return `${ep}/repos/${owner}/${name}/commits/${ref}/status`
}

/**
 * Returns a value indicating whether or not the cache entry provided
 * should be considered stale enough that a refresh from the API is
 * warranted.
 */
function entryIsEligibleForRefresh(entry: ICommitStatusCacheEntry) {
  // The age (in milliseconds) of the cache entry, i.e. how long it has
  // sat in the cache since last being fetched.
  const now = Date.now()
  const age = now - entry.fetchedAt.valueOf()

  // The GitHub API has a max-age of 60, so no need to refresh
  // any more frequently than that since chromium would just give
  // us the cached value.
  return age > 60 * 1000
}

/**
 * The interval (in milliseconds) between background updates for active
 * commit status subscriptions. Background refresh occurs only when the
 * application is focused.
 */
const BackgroundRefreshInterval = 3 * 60 * 1000
const MaxConcurrentFetches = 5

export class CommitStatusStore {
  /** The list of signed-in accounts, kept in sync with the accounts store */
  private accounts: ReadonlyArray<Account> = []

  private backgroundRefreshHandle: number | null = null
  private refreshQueued = false

  /**
   * A map keyed on the value of `getCacheKey` containing one object
   * per active subscription which contain all the information required
   * to update a commit status from the API and notify subscribers.
   */
  private readonly subscriptions = new Map<string, IRefStatusSubscription>()
  private readonly cache = new QuickLRU<string, ICommitStatusCacheEntry>({
    maxSize: 250,
  })
  private readonly queue = new Set<string>()
  private readonly limit = pLimit(MaxConcurrentFetches)

  public constructor(accountsStore: AccountsStore) {
    accountsStore.getAll().then(accounts => (this.accounts = accounts))
    accountsStore.onDidUpdate(accounts => (this.accounts = accounts))

    ipcRenderer.on('focus', () => {
      this.startBackgroundRefresh()
      this.queueRefresh()
    })

    ipcRenderer.on('blur', () => this.stopBackgroundRefresh())

    if (remote.getCurrentWindow().isFocused()) {
      this.startBackgroundRefresh()
    }
  }

  private startBackgroundRefresh() {
    if (this.backgroundRefreshHandle === null) {
      this.backgroundRefreshHandle = window.setInterval(
        () => this.queueRefresh(),
        BackgroundRefreshInterval
      )
    }
  }

  private stopBackgroundRefresh() {
    if (this.backgroundRefreshHandle !== null) {
      window.clearInterval(this.backgroundRefreshHandle)
      this.backgroundRefreshHandle = null
    }
  }

  private queueRefresh() {
    if (!this.refreshQueued) {
      this.refreshQueued = true
      setImmediate(() => {
        this.refreshQueued = false
        this.refreshEligibleSubscriptions()
      })
    }
  }

  private refreshEligibleSubscriptions() {
    for (const key of this.subscriptions.keys()) {
      // Is it already being worked on?
      if (this.queue.has(key)) {
        continue
      }

      const entry = this.cache.get(key)

      if (entry && !entryIsEligibleForRefresh(entry)) {
        continue
      }

      this.limit(() => this.refreshSubscription(key))
        .catch(e => log.error('Failed refreshing commit status', e))
        .then(() => this.queue.delete(key))

      this.queue.add(key)
    }
  }

  private async refreshSubscription(key: string) {
    // Make sure it's still a valid subscription that
    // someone might care about before fetching
    const subscription = this.subscriptions.get(key)

    if (subscription === undefined) {
      return
    }

    const { endpoint, owner, name, ref } = subscription
    const account = this.accounts.find(a => a.endpoint === endpoint)

    if (account === undefined) {
      return
    }

    const status = await API.fromAccount(account)
      .fetchCombinedRefStatus(owner, name, ref)
      .catch(err => null)

    const entry = { status, fetchedAt: new Date() }
    this.cache.set(getCacheKey(endpoint, owner, name, ref), entry)

    subscription.callbacks.forEach(cb => cb(status))
  }

  public tryGetStatus(
    repository: GitHubRepository,
    ref: string
  ): IAPIRefStatus | null {
    const entry = this.cache.get(getCacheKeyForRepository(repository, ref))
    return entry !== undefined ? entry.status : null
  }

  private getOrCreateSubscription(repository: GitHubRepository, ref: string) {
    const key = getCacheKeyForRepository(repository, ref)
    let subscription = this.subscriptions.get(key)

    if (subscription !== undefined) {
      return subscription
    }

    subscription = {
      endpoint: repository.endpoint,
      owner: repository.owner.login,
      name: repository.name,
      ref,
      callbacks: new Set<StatusCallBack>(),
    }

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
    repository: GitHubRepository,
    ref: string,
    callback: StatusCallBack
  ): IDisposable {
    const key = getCacheKeyForRepository(repository, ref)
    const subscription = this.getOrCreateSubscription(repository, ref)

    subscription.callbacks.add(callback)
    this.queueRefresh()

    return new Disposable(() => {
      subscription.callbacks.delete(callback)
      if (subscription.callbacks.size === 0) {
        this.subscriptions.delete(key)
      }
    })
  }
}
