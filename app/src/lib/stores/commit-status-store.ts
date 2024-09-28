import pLimit from 'p-limit'
import QuickLRU from 'quick-lru'

import { Disposable, DisposableLike } from 'event-kit'
import xor from 'lodash/xor'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { API, getAccountForEndpoint, IAPICheckSuite } from '../api'
import {
  apiCheckRunToRefCheck,
  apiStatusToRefCheck,
  createCombinedCheckFromChecks,
  getCheckRunActionsWorkflowRuns,
  getLatestCheckRunsById,
  getLatestPRWorkflowRunsLogsForCheckRun,
  ICombinedRefCheck,
  IRefCheck,
  manuallySetChecksToPending,
} from '../ci-checks/ci-checks'
import { offsetFromNow } from '../offset-from'
import { AccountsStore } from './accounts-store'

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

  /** If provided, we retrieve the actions workflow runs or the checks with this sub */
  readonly branchName?: string
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

  public async manualRefreshSubscription(
    repository: GitHubRepository,
    ref: string,
    pendingChecks: ReadonlyArray<IRefCheck>
  ) {
    const key = getCacheKeyForRepository(repository, ref)
    const subscription = this.subscriptions.get(key)

    if (subscription === undefined) {
      return
    }

    const cache = this.cache.get(key)?.check
    if (cache === undefined || cache === null) {
      return
    }

    const check = manuallySetChecksToPending(cache.checks, pendingChecks)
    this.cache.set(key, { check, fetchedAt: new Date() })
    subscription.callbacks.forEach(cb => cb(check))
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
      const latestCheckRunsByName = getLatestCheckRunsById(checkRuns.check_runs)
      checks.push(...latestCheckRunsByName.map(apiCheckRunToRefCheck))
    }

    let checksWithActions = null
    if (subscription.branchName !== undefined) {
      checksWithActions = await this.getAndMapActionWorkflowRunsToCheckRuns(
        checks,
        key,
        subscription.branchName
      )
    }

    const check = createCombinedCheckFromChecks(checksWithActions ?? checks)
    this.cache.set(key, { check, fetchedAt: new Date() })
    subscription.callbacks.forEach(cb => cb(check))
  }

  private async getAndMapActionWorkflowRunsToCheckRuns(
    checks: ReadonlyArray<IRefCheck>,
    key: string,
    branchName: string
  ): Promise<ReadonlyArray<IRefCheck> | null> {
    const existingChecks = this.cache.get(key)

    // If the checks haven't changed since last status refresh, don't bother
    // retrieving actions workflows and they could be stale if this is directly after a rerun
    if (
      existingChecks !== undefined &&
      existingChecks.check !== null &&
      existingChecks.check.checks.some(c => c.actionsWorkflow !== undefined) &&
      xor(
        existingChecks.check.checks.map(cr => cr.id),
        checks.map(cr => cr.id)
      ).length === 0
    ) {
      // Apply existing action workflow and job steps from cache to refreshed checks
      const mapped = new Array<IRefCheck>()
      for (const cr of checks) {
        const matchingCheck = existingChecks.check.checks.find(
          c => c.id === cr.id
        )

        if (matchingCheck === undefined) {
          // Shouldn't happen, but if it did just keep what we have
          mapped.push(cr)
          continue
        }

        const { actionsWorkflow, actionJobSteps } = matchingCheck
        mapped.push({
          ...cr,
          actionsWorkflow,
          actionJobSteps,
        })
      }
      return mapped
    }

    const checkRunsWithActionsWorkflows =
      await this.getCheckRunActionsWorkflowRuns(key, branchName, checks)

    const checkRunsWithActionsWorkflowJobs =
      await this.mapActionWorkflowRunsJobsToCheckRuns(
        key,
        checkRunsWithActionsWorkflows
      )

    return checkRunsWithActionsWorkflowJobs
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
    ref: string,
    branchName?: string
  ): ICombinedRefCheck | null {
    const key = getCacheKeyForRepository(repository, ref)
    if (
      branchName !== undefined &&
      this.subscriptions.get(key)?.branchName !== branchName
    ) {
      return null
    }

    return this.cache.get(key)?.check ?? null
  }

  private getOrCreateSubscription(
    repository: GitHubRepository,
    ref: string,
    branchName?: string
  ) {
    const key = getCacheKeyForRepository(repository, ref)
    let subscription = this.subscriptions.get(key)

    if (subscription !== undefined) {
      if (subscription.branchName === branchName) {
        return subscription
      }

      const withBranchName = { ...subscription, branchName }
      this.subscriptions.set(key, withBranchName)
      const cache = this.cache.get(key)
      if (cache !== undefined) {
        this.cache.set(key, {
          ...cache,
          // The commit status store is set to only retreive on a refresh
          // trigger if the subscription has not been fetched for 60 minutes
          // (cache/api limit). This sets this sub back to 61 so that on next
          // refresh triggered, it will be reretreived, as this time, it will be
          // different given the branch name is provided.
          fetchedAt: new Date(offsetFromNow(-61, 'minutes')),
        })
      }

      return withBranchName
    }

    subscription = {
      endpoint: repository.endpoint,
      owner: repository.owner.login,
      name: repository.name,
      ref,
      callbacks: new Set<StatusCallBack>(),
      branchName,
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
    callback: StatusCallBack,
    branchName?: string
  ): DisposableLike {
    const key = getCacheKeyForRepository(repository, ref)
    const subscription = this.getOrCreateSubscription(
      repository,
      ref,
      branchName
    )

    subscription.callbacks.add(callback)
    this.queueRefresh()

    return new Disposable(() => {
      subscription.callbacks.delete(callback)
      if (subscription.callbacks.size === 0) {
        this.subscriptions.delete(key)
      }
    })
  }

  /**
   * Retrieve GitHub Actions workflows and maps them to the check runs if
   * applicable
   */
  private async getCheckRunActionsWorkflowRuns(
    key: string,
    branchName: string,
    checkRuns: ReadonlyArray<IRefCheck>
  ): Promise<ReadonlyArray<IRefCheck>> {
    const subscription = this.subscriptions.get(key)
    if (subscription === undefined) {
      return checkRuns
    }

    const { endpoint, owner, name } = subscription
    const account = this.accounts.find(a => a.endpoint === endpoint)
    if (account === undefined) {
      return checkRuns
    }

    return getCheckRunActionsWorkflowRuns(
      account,
      owner,
      name,
      branchName,
      checkRuns
    )
  }

  /**
   * Retrieve GitHub Actions job and logs for the check runs.
   */
  private async mapActionWorkflowRunsJobsToCheckRuns(
    key: string,
    checkRuns: ReadonlyArray<IRefCheck>
  ): Promise<ReadonlyArray<IRefCheck>> {
    const subscription = this.subscriptions.get(key)
    if (subscription === undefined) {
      return checkRuns
    }

    const { endpoint, owner, name } = subscription
    const account = this.accounts.find(a => a.endpoint === endpoint)

    if (account === undefined) {
      return checkRuns
    }

    const api = API.fromAccount(account)

    return getLatestPRWorkflowRunsLogsForCheckRun(api, owner, name, checkRuns)
  }

  public async rerequestCheckSuite(
    repository: GitHubRepository,
    checkSuiteId: number
  ): Promise<boolean> {
    const { owner, name } = repository
    const account = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    return api.rerequestCheckSuite(owner.login, name, checkSuiteId)
  }

  public async rerunJob(
    repository: GitHubRepository,
    jobId: number
  ): Promise<boolean> {
    const { owner, name } = repository
    const account = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    return api.rerunJob(owner.login, name, jobId)
  }

  public async rerunFailedJobs(
    repository: GitHubRepository,
    workflowRunId: number
  ): Promise<boolean> {
    const { owner, name } = repository
    const account = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (account === null) {
      return false
    }

    const api = API.fromAccount(account)
    return api.rerunFailedJobs(owner.login, name, workflowRunId)
  }

  public async fetchCheckSuite(
    repository: GitHubRepository,
    checkSuiteId: number
  ): Promise<IAPICheckSuite | null> {
    const { owner, name } = repository
    const account = getAccountForEndpoint(this.accounts, repository.endpoint)
    if (account === null) {
      return null
    }

    const api = API.fromAccount(account)
    return api.fetchCheckSuite(owner.login, name, checkSuiteId)
  }
}
