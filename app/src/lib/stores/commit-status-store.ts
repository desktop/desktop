import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'

import { Account } from '../../models/account'
import { AccountsStore } from './accounts-store'
import { GitHubRepository } from '../../models/github-repository'
import {
  API,
  IAPIRefStatusItem,
  IAPIRefCheckRun,
  APICheckStatus,
  APICheckConclusion,
} from '../api'
import { IDisposable, Disposable } from 'event-kit'

/**
 * A Desktop-specific model closely related to a GitHub API Check Run.
 *
 * The RefCheck object abstracts the difference between the legacy
 * Commit Status objects and the modern Check Runs and unifies them
 * under one common interface. Since all commit statuses can be
 * represented as Check Runs but not all Check Runs can be represented
 * as statuses the model closely aligns with Check Runs.
 */
export interface IRefCheck {
  readonly name: string
  readonly description: string
  readonly status: APICheckStatus
  readonly conclusion: APICheckConclusion | null
}

/**
 * A combined view of all legacy commit statuses as well as
 * check runs for a particular Git reference.
 */
export interface ICombinedRefCheck {
  readonly status: APICheckStatus
  readonly conclusion: APICheckConclusion | null
  readonly checks: ReadonlyArray<IRefCheck>
}

interface ICommitStatusCacheEntry {
  /**
   * The combined ref status from the API or null if
   * the status could not be retrieved.
   */
  readonly check: ICombinedRefCheck | null

  /**
   * The timestamp for when this cache entry was last
   * fetched from the API (i.e. when it was created).
   */
  readonly fetchedAt: Date
}

export type StatusCallBack = (status: ICombinedRefCheck | null) => void

/**
 * An interface describing one or more subscriptions for
 * which to deliver updates about commit status for a particular
 * ref.
 */
interface IRefStatusSubscription {
  /**
   * TThe repository endpoint (for example https://api.github.com for
   * GitHub.com and https://github.corporation.local/api for GHE)
   */
  readonly endpoint: string

  /** Owner The repository owner's login (i.e niik for niik/desktop) */
  readonly owner: string

  /** The repository name */
  readonly name: string

  /** The commit ref (can be a SHA or a Git ref) for which to fetch status. */
  readonly ref: string

  /** One or more callbacks to notify when the commit status is updated */
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
 * @param endpoint The repository endpoint (for example https://api.github.com for
 *                 GitHub.com and https://github.corporation.local/api for GHE)
 * @param owner    The repository owner's login (i.e niik for niik/desktop)
 * @param name     The repository name
 * @param ref      The commit ref (can be a SHA or a Git ref) for which to fetch
 *                 status.
 */
function getCacheKey(
  endpoint: string,
  owner: string,
  name: string,
  ref: string
) {
  return `${endpoint}/repos/${owner}/${name}/commits/${ref}`
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
  // any more frequently than that since Chromium would just give
  // us the cached value.
  return age > 60 * 1000
}

/**
 * The interval (in milliseconds) between background updates for active
 * commit status subscriptions. Background refresh occurs only when the
 * application is focused.
 */
const BackgroundRefreshInterval = 3 * 60 * 1000
const MaxConcurrentFetches = 6

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

  /**
   * A map keyed on the value of `getCacheKey` containing one object per
   * reference (repository specific) with the last retrieved commit status
   * for that reference.
   *
   * This map also functions as a least recently used cache and will evict
   * the least recently used commit statuses to ensure the cache won't
   * grow unbounded
   */
  private readonly cache = new QuickLRU<string, ICommitStatusCacheEntry>({
    maxSize: 250,
  })

  /**
   * A set containing the currently executing (i.e. refreshing) cache
   * keys (produced by `getCacheKey`).
   */
  private readonly queue = new Set<string>()

  /**
   * A concurrency limiter which ensures that we only run `MaxConcurrentFetches`
   * API requests simultaneously.
   */
  private readonly limit = pLimit(MaxConcurrentFetches)

  public constructor(accountsStore: AccountsStore) {
    accountsStore.getAll().then(this.onAccountsUpdated)
    accountsStore.onDidUpdate(this.onAccountsUpdated)
  }

  private readonly onAccountsUpdated = (accounts: ReadonlyArray<Account>) => {
    this.accounts = accounts
  }

  /**
   * Called to ensure that background refreshing is running and fetching
   * updated commit statuses for active subscriptions. The intention is
   * for background refreshing to be active while the application is
   * focused.
   *
   * Remarks: this method will do nothing if background fetching is
   *          already active.
   */
  public startBackgroundRefresh() {
    if (this.backgroundRefreshHandle === null) {
      this.backgroundRefreshHandle = window.setInterval(
        () => this.queueRefresh(),
        BackgroundRefreshInterval
      )
      this.queueRefresh()
    }
  }

  /**
   * Called to ensure that background refreshing is stopped. The intention
   * is for background refreshing to be active while the application is
   * focused.
   *
   * Remarks: this method will do nothing if background fetching is
   *          not currently active.
   */
  public stopBackgroundRefresh() {
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

  /**
   * Looks through all active commit status subscriptions and
   * figure out which, if any, needs to be refreshed from the
   * API.
   */
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

    const api = API.fromAccount(account)

    const [statuses, checkRuns] = await Promise.all([
      api.fetchCombinedRefStatus(owner, name, ref),
      api.fetchRefCheckRuns(owner, name, ref),
    ])

    const checks = new Array<IRefCheck>()

    if (statuses === null && checkRuns === null) {
      // Okay, so we failed retrieving the status for one reason or another.
      // That's a bummer, but we still need to put something in the cache
      // or else we'll consider this subscription eligible for refresh
      // from here on until we succeed in fetching. By putting a blank
      // cache entry (or potentially reusing the last entry) in and not
      // notifying subscribers we ensure they keep their current status
      // if they have one and that we attempt to fetch it again on the same
      // schedule as the others.
      const existingEntry = this.cache.get(key)
      const check = existingEntry?.check ?? null

      this.cache.set(key, { check, fetchedAt: new Date() })
      return
    }

    if (statuses !== null) {
      checks.push(...statuses.statuses.map(apiStatusToRefCheck))
    }

    if (checkRuns !== null) {
      const latestCheckRunsByName = getLatestCheckRunsByName(
        checkRuns.check_runs
      )
      checks.push(...latestCheckRunsByName.map(apiCheckRunToRefCheck))
    }

    const check = createCombinedCheckFromChecks(checks)
    this.cache.set(key, { check, fetchedAt: new Date() })
    subscription.callbacks.forEach(cb => cb(check))
  }

  /**
   * Attempt to _synchronously_ retrieve a commit status for a particular
   * ref. If the ref doesn't exist in the cache this function returns null.
   *
   * Useful for component who wish to have a value for the initial render
   * instead of waiting for the subscription to produce an event.
   */
  public tryGetStatus(
    repository: GitHubRepository,
    ref: string
  ): ICombinedRefCheck | null {
    const key = getCacheKeyForRepository(repository, ref)
    return this.cache.get(key)?.check ?? null
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

/**
 * Convert a legacy API commit status to a fake check run
 */
function apiStatusToRefCheck(apiStatus: IAPIRefStatusItem): IRefCheck {
  let state: APICheckStatus
  let conclusion: APICheckConclusion | null = null

  if (apiStatus.state === 'success') {
    state = 'completed'
    conclusion = 'success'
  } else if (apiStatus.state === 'pending') {
    state = 'in_progress'
  } else {
    state = 'completed'
    conclusion = 'failure'
  }

  return {
    name: apiStatus.context,
    description: apiStatus.description,
    status: state,
    conclusion,
  }
}

/**
 * Convert an API check run object to a RefCheck model
 */
function apiCheckRunToRefCheck(checkRun: IAPIRefCheckRun): IRefCheck {
  return {
    name: checkRun.name,
    description:
      checkRun?.output.title ?? checkRun.conclusion ?? checkRun.status,
    status: checkRun.status,
    conclusion: checkRun.conclusion,
  }
}

function createCombinedCheckFromChecks(
  checks: ReadonlyArray<IRefCheck>
): ICombinedRefCheck | null {
  if (checks.length === 0) {
    // This case is distinct from when we fail to call the API in
    // that this means there are no checks or statuses so we should
    // clear whatever info we've got for this ref.
    return null
  }

  if (checks.length === 1) {
    // If we've got exactly one check then we can mirror its status
    // and conclusion 1-1 without having to create an aggregate status
    const { status, conclusion } = checks[0]
    return { status, conclusion, checks }
  }

  if (checks.some(isIncompleteOrFailure)) {
    return { status: 'completed', conclusion: 'failure', checks }
  } else if (checks.every(isSuccess)) {
    return { status: 'completed', conclusion: 'success', checks }
  } else {
    return { status: 'in_progress', conclusion: null, checks }
  }
}

/**
 * Whether the check is either incomplete or has failed
 */
export function isIncompleteOrFailure(check: IRefCheck) {
  return isIncomplete(check) || isFailure(check)
}

/**
 * Whether the check is incomplete (timed out, stale or cancelled).
 *
 * The terminology here is confusing and deserves explanation. An
 * incomplete check is a check run that has been started and who's
 * state is 'completed' but it never got to produce a conclusion
 * because it was either cancelled, it timed out, or GitHub marked
 * it as stale.
 */
export function isIncomplete(check: IRefCheck) {
  if (check.status === 'completed') {
    switch (check.conclusion) {
      case 'timed_out':
      case 'stale':
      case 'cancelled':
        return true
    }
  }

  return false
}

/** Whether the check has failed (failure or requires action) */
export function isFailure(check: IRefCheck) {
  if (check.status === 'completed') {
    switch (check.conclusion) {
      case 'failure':
      case 'action_required':
        return true
    }
  }

  return false
}

/** Whether the check can be considered successful (success, neutral or skipped) */
export function isSuccess(check: IRefCheck) {
  if (check.status === 'completed') {
    switch (check.conclusion) {
      case 'success':
      case 'neutral':
      case 'skipped':
        return true
    }
  }

  return false
}

/**
 * In some cases there may be multiple check runs reported for a
 * reference. In that case GitHub.com will pick only the latest
 * run for each check name to present in the PR merge footer and
 * only the latest run counts towards the mergeability of a PR.
 *
 * We use the check suite id as a proxy for determining what's
 * the "latest" of two check runs with the same name.
 */
function getLatestCheckRunsByName(
  checkRuns: ReadonlyArray<IAPIRefCheckRun>
): ReadonlyArray<IAPIRefCheckRun> {
  const latestCheckRunsByName = new Map<string, IAPIRefCheckRun>()

  for (const checkRun of checkRuns) {
    const current = latestCheckRunsByName.get(checkRun.name)
    if (
      current === undefined ||
      current.check_suite.id < checkRun.check_suite.id
    ) {
      latestCheckRunsByName.set(checkRun.name, checkRun)
    }
  }

  return [...latestCheckRunsByName.values()]
}
