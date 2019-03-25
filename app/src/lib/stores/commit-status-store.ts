import { Account } from '../../models/account'
import { AccountsStore } from './accounts-store'
import { GitHubRepository } from '../../models/github-repository'
import { API, IAPIRefStatus } from '../api'
import { concurrentMap } from '../promise'
import { IDisposable, Disposable } from 'event-kit'

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

function getCacheKey(repository: GitHubRepository, ref: string) {
  const { endpoint, owner, name } = repository
  return getCacheKeyForRef(endpoint, owner.login, name, ref)
}

function getCacheKeyForRef(
  endpoint: string,
  owner: string,
  name: string,
  ref: string
) {
  return `${endpoint}/${owner}/${name}/${ref}`
}

function entryIsEligibleForRefresh(entry: ICommitStatusCacheEntry) {
  const elapsed = Date.now() - entry.fetchedAt.valueOf()
  return elapsed > 60 * 1000
}

export class CommitStatusStore {
  private accounts: ReadonlyArray<Account> = []

  private refreshQueued = false
  private readonly subscriptions = new Map<string, IRefStatusSubscription>()
  private readonly cache = new Map<string, ICommitStatusCacheEntry>()

  public constructor(accountsStore: AccountsStore) {
    accountsStore.getAll().then(accounts => {
      this.accounts = accounts
    })

    accountsStore.onDidUpdate(accounts => {
      this.accounts = accounts
    })

    window.addEventListener('focus', async () => {
      this.queueRefresh()
    })
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

  private async refreshEligibleSubscriptions() {
    const refresh = new Array<IRefStatusSubscription>()

    for (const [key, subscriptions] of this.subscriptions) {
      const entry = this.cache.get(key)

      if (!entry || entryIsEligibleForRefresh(entry)) {
        refresh.push(subscriptions)
      }
    }

    await concurrentMap(refresh, this.refreshSubscription, 5).catch(() => null)
  }

  private refreshSubscription = async (
    subscription: IRefStatusSubscription
  ) => {
    const { endpoint, owner, name, ref } = subscription
    const status = await this.fetchStatus(endpoint, owner, name, ref)
    this.cache.set(getCacheKeyForRef(endpoint, owner, name, ref), {
      status,
      fetchedAt: new Date(),
    })

    subscription.callbacks.forEach(cb => cb(status))
  }

  public tryGetStatus(
    repository: GitHubRepository,
    ref: string
  ): IAPIRefStatus | null {
    const entry = this.cache.get(getCacheKey(repository, ref))
    return entry !== undefined ? entry.status : null
  }

  private async fetchStatus(
    endpoint: string,
    owner: string,
    name: string,
    ref: string
  ): Promise<IAPIRefStatus | null> {
    const account = this.accounts.find(a => a.endpoint === endpoint)

    if (account === undefined) {
      return null
    }

    return API.fromAccount(account)
      .fetchCombinedRefStatus(owner, name, ref)
      .catch(err => null)
  }

  private getOrCreateSubscription(repository: GitHubRepository, ref: string) {
    let subscription = this.subscriptions.get(getCacheKey(repository, ref))

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

    return subscription
  }

  public subscribe(
    repository: GitHubRepository,
    ref: string,
    callback: StatusCallBack
  ): IDisposable {
    const key = getCacheKey(repository, ref)
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
