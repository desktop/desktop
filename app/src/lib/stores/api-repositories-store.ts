import { BaseStore } from './base-store'
import { AccountsStore } from './accounts-store'
import { IAPIRepository, API } from '../api'
import { Account } from '../../models/account'
import { merge } from '../merge'

/**
 * An interface describing the current state of
 * repositories that a particular account has explicit
 * permissions to access and whether or not the list of
 * repositores is being loaded or refreshed.
 *
 * This main purpose of this interface is to describe
 * the state necessary to render a list of cloneable
 * repositories.
 */
export interface IAccountRepositories {
  /**
   * The list of repositories that a particular account
   * has explicit permissions to access.
   */
  readonly repositories: ReadonlyArray<IAPIRepository>

  /**
   * Whether or not the list of repositories is currently
   * being loaded for the first time or refreshed.
   */
  readonly loading: boolean
}

/**
 * A store responsible for providing lists of repositories
 * that the currently signed in user(s) have explicit access
 * to. It's primary purpose is to serve state required for
 * the application to present a list of cloneable repositories
 * for a particular user.
 */
export class ApiRepositoriesStore extends BaseStore {
  /**
   * The main internal state of the store. Note that
   * all state in this store should be treated as immutable such
   * that consumers can use reference equality to determine whether
   * state has actually changed or not.
   */
  private accountState: ReadonlyMap<Account, IAccountRepositories> = new Map<
    Account,
    IAccountRepositories
  >()

  public constructor(private readonly accountsStore: AccountsStore) {
    super()
    accountsStore.onDidUpdate(() => this.onAccountsChanged())
  }

  /**
   * Called whenever the accounts store emits an update which
   * usually means that a new account was added or an account
   * was removed due to sign out but it could also mean that
   * the account data has been updated. It's crucial that
   * the ApiRepositories store match (through reference
   * equality) the accounts in the accounts store and this
   * method therefore attempts to merge its internal state
   * with the new accounts.
   */
  private async onAccountsChanged() {
    const accounts = await this.accountsStore.getAll()
    const newState = new Map<Account, IAccountRepositories>()

    for (const account of accounts) {
      for (const [key, value] of this.accountState.entries()) {
        // Check to see whether the accounts store only emitted an
        // updated Account for the same login and endpoint meaning
        // that we don't need to discard our cached data.
        if (key.login === account.login && key.endpoint === account.endpoint) {
          newState.set(account, value)
          break
        }
      }
    }

    this.accountState = newState
    this.emitUpdate()
  }

  private updateAccount<T, K extends keyof IAccountRepositories>(
    account: Account,
    repositories: Pick<IAccountRepositories, K>
  ) {
    const newState = new Map<Account, IAccountRepositories>(this.accountState)
    const existingRepositories = newState.get(account)

    const newRepositories =
      existingRepositories === undefined
        ? merge({ loading: false, repositories: [] }, repositories)
        : merge(existingRepositories, repositories)

    newState.set(account, newRepositories)

    this.accountState = newState
    this.emitUpdate()
  }

  /**
   * Request that the store loads the list of repositories that
   * the provided account has explicit permissions to access.
   */
  public async loadRepositories(account: Account) {
    const existingRepositories = this.accountState.get(account)

    if (existingRepositories !== undefined && existingRepositories.loading) {
      return
    }

    this.updateAccount(account, { loading: true })

    const api = API.fromAccount(account)
    const repositories = await api.fetchRepositories()

    if (repositories === null) {
      this.updateAccount(account, { loading: false })
    } else {
      this.updateAccount(account, { loading: false, repositories })
    }
  }

  public getState(): ReadonlyMap<Account, IAccountRepositories> {
    return this.accountState
  }
}
