import { BaseStore } from './base-store'
import { AccountsStore } from './accounts-store'
import { IAPIRepository, API } from '../api'
import { Account } from '../../models/account'
import { merge } from '../merge'

/**
 * Returns a value indicating whether two account instances
 * can be considered equal. Equality is determined by comparing
 * the two instances' endpoints and user id. This allows
 * us to keep receiving updated Account details from the API
 * while still maintaining the association between repositories
 * and a particular account.
 */
function accountEquals(x: Account, y: Account) {
  return x.endpoint === y.endpoint && x.id === y.id
}

/**
 * Attempt to look up an existing account in the account state
 * map based on endpoint and user id equality (see accountEquals).
 *
 * The purpose of this method is to ensure that we're using the
 * most recent Account instance during our asynchronous refresh
 * operations. While we're refreshing the list of repositories
 * that a user has explicit permissions to access it's possible
 * that the accounts store will emit updated account instances
 * (for example updating the user real name, or the list of
 * email addresses associated with an account) and in order to
 * guarantee reference equality with the accounts emitted by
 * the accounts store we need to ensure we're in sync.
 *
 * If no match is found the provided account is returned.
 */
function resolveAccount(
  account: Account,
  accountState: ReadonlyMap<Account, IAccountRepositories>
) {
  // The set uses reference equality so if we find our
  // account instance in the set there's no need to look
  // any further.
  if (accountState.has(account)) {
    return account
  }

  // If we can't find our account instance in the set one
  // of two things have happened. Either the account has
  // been removed (by the user explicitly signing out) or
  // the accounts store has refreshed the account details
  // from the API and as such the reference equality no
  // longer holds. In the latter case we attempt to
  // find the updated account instance by comparing its
  // user id and endpoint to the provided account.
  for (const existingAccount of accountState.keys()) {
    if (accountEquals(existingAccount, account)) {
      return existingAccount
    }
  }

  // If we can't find a matching account it's likely
  // that it's the first time we're loading the list
  // of repositories for this account so we return
  // whatever was provided to us such that it may be
  // inserted into the set as a new entry.
  return account
}

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
        if (accountEquals(key, account)) {
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

    // The account instance might have changed between the refresh and
    // the update so we'll need to look it up by endpoint and user id.
    // If we can't find it we're likely being asked to insert info for
    // an account for the first time.
    const newOrExistingAccount = resolveAccount(account, newState)
    const existingRepositories = newState.get(newOrExistingAccount)

    const newRepositories =
      existingRepositories === undefined
        ? merge({ loading: false, repositories: [] }, repositories)
        : merge(existingRepositories, repositories)

    newState.set(newOrExistingAccount, newRepositories)

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
