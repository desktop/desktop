import { BaseStore } from './base-store'
import { AccountsStore } from './accounts-store'
import { IAPIRepository, API } from '../api'
import { Account, accountEquals } from '../../models/account'
import { merge } from '../merge'

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
 * repositories is being loaded or refreshed.
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

  public constructor(accountsStore: AccountsStore) {
    super()
    accountsStore.onDidUpdate(this.onAccountsChanged)
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
  private onAccountsChanged = (accounts: ReadonlyArray<Account>) => {
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

  private updateAccount<K extends keyof IAccountRepositories>(
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

  private getAccountState(account: Account) {
    return this.accountState.get(resolveAccount(account, this.accountState))
  }

  /**
   * Request that the store loads the list of repositories that
   * the provided account has explicit permissions to access.
   */
  public async loadRepositories(account: Account) {
    const currentState = this.getAccountState(account)

    if (currentState?.loading) {
      return
    }

    this.updateAccount(account, { loading: true })

    // We don't want to throw away the existing list of repositories if we're
    // refreshing the list of repositories but we'll need to keep track of
    // whether any repositories got deleted on the host so that we can remove
    // them from our local state. We start out by adding all the repositories
    // that we've seen up until this point to a map and then we'll remove them
    // one by one as we load the fresh list from the API. Any repositories
    // remaining in the map once we're done loading we can assume have been
    // deleted on the host.
    const missing = new Map<string, IAPIRepository>()
    const repositories = new Map<string, IAPIRepository>()

    currentState?.repositories.forEach(r => {
      missing.set(r.clone_url, r)
      repositories.set(r.clone_url, r)
    })

    const addPage = (page: ReadonlyArray<IAPIRepository>) => {
      page.forEach(r => {
        repositories.set(r.clone_url, r)
        missing.delete(r.clone_url)
      })
      this.updateAccount(account, { repositories: [...repositories.values()] })
    }

    const api = API.fromAccount(resolveAccount(account, this.accountState))

    // The vast majority of users have few repositories and no org affiliations.
    // We'll start by making one request to load all repositories available to
    // the user regardless of affiliation and only if that request isn't enough
    // to load all repositories will we divvy up the requests and load
    // repositories by owner and collaborator+org affiliation separately. This
    // way we can avoid making unnecessary requests to the API for the majority
    // of users while still improving the user experience for those users who
    // have access to a lot of repositories and orgs.
    await api.streamUserRepositories(addPage, undefined, {
      async continue() {
        // If the continue callback is called we know that the first request
        // wasn't enough to load all repositories.
        //
        // For these users (with access to more than 100 repositories) we'll
        // stream each of the three different affiliation types concurrently to
        // minimize the time it takes to load all repositories.
        await Promise.all([
          api.streamUserRepositories(addPage, 'owner'),
          api.streamUserRepositories(addPage, 'collaborator'),
          api.streamUserRepositories(addPage, 'organization_member'),
        ])

        // Don't load more than one page in the initial stream request.
        return false
      },
    })

    if (missing.size) {
      missing.forEach((_, clone_url) => repositories.delete(clone_url))
      this.updateAccount(account, { repositories: [...repositories.values()] })
    }

    this.updateAccount(account, { loading: false })
  }

  public getState(): ReadonlyMap<Account, IAccountRepositories> {
    return this.accountState
  }
}
