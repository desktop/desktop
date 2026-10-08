import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../auth'
import { Account, isDotComAccount } from '../../models/account'
import { fetchUser, EmailVisibility, getEnterpriseAPIURL } from '../api'
import { fatalError } from '../fatal-error'
import { TypedBaseStore } from './base-store'
import { isGHE } from '../endpoint-capabilities'
import { compare, compareDescending } from '../compare'
import { Disposable } from 'event-kit'
import { deleteToken } from '../api'
import { IOAuthToken, refreshOAuthToken } from '../oauth-token'
import { deserializeAccountCredential } from '../account-credential'
import {
  AccountRequiresSignInError,
  CredentialSessions,
  refreshMargin,
} from '../credential-sessions'

// Ensure that GitHub.com accounts appear first followed by Enterprise
// accounts, sorted by the order in which they were added.
const sortAccounts = (accounts: ReadonlyArray<Account>) =>
  accounts
    .map((account, ix) => [account, ix] as const)
    .sort(
      ([xAccount, xIx], [yAccount, yIx]) =>
        compareDescending(
          isDotComAccount(xAccount),
          isDotComAccount(yAccount)
        ) || compare(xIx, yIx)
    )
    .map(([account]) => account)

/** The data-only interface for storage. */
interface IEmail {
  readonly email: string
  /**
   * Represents whether GitHub has confirmed the user has access to this
   * email address. New users require a verified email address before
   * they can sign into GitHub Desktop.
   */
  readonly verified: boolean
  /**
   * Flag for the user's preferred email address. Other email addresses
   * are provided for associating commit authors with the one GitHub account.
   */
  readonly primary: boolean

  /** The way in which the email is visible. */
  readonly visibility: EmailVisibility
}

function isKeyChainError(e: any) {
  const error = e as Error
  return (
    error.message &&
    error.message.startsWith(
      'The user name or passphrase you entered is not correct'
    )
  )
}

/** The data-only interface for storage. */
interface IAccount {
  readonly token: string
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<IEmail>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
  readonly plan?: string
}

/** The store for logged in accounts. */
export class AccountsStore extends TypedBaseStore<ReadonlyArray<Account>> {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private accounts: ReadonlyArray<Account> = []
  private readonly credentials: CredentialSessions

  /** A promise that will resolve when the accounts have been loaded. */
  private loadingPromise: Promise<void>

  public constructor(
    dataStore: IDataStore,
    secureStore: ISecureStore,
    renewToken = refreshOAuthToken,
    now = Date.now,
    revokeToken = deleteToken
  ) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
    this.credentials = new CredentialSessions(
      secureStore,
      {
        requireSignIn: this.requireSignIn,
        onTokenRenewed: this.onTokenRenewed,
        onSignedIn: this.onSignedIn,
      },
      renewToken,
      now,
      revokeToken
    )
    this.loadingPromise = this.loadFromStore()
  }

  /**
   * Get the list of accounts in the cache.
   */
  public async getAll(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise

    return this.accounts.slice()
  }

  /** Notify once per account when invalid credentials sign it out. */
  public onTokenInvalidated(callback: (account: Account) => void): Disposable {
    return this.emitter.on('token-invalidated', callback)
  }

  /** Handle a rejected API token without leaving unhandled callback errors. */
  public handleTokenInvalidated = (endpoint: string, token: string): void => {
    void this.invalidateToken(endpoint, token).catch(error => {
      log.error('Unable to invalidate rejected GitHub credentials', error)
      this.emitError(error)
    })
  }

  /** Resolve token snapshots held by long-lived clients without changing identity. */
  public resolveToken = async (
    endpoint: string,
    token: string
  ): Promise<string> => {
    await this.loadingPromise
    return this.credentials.resolveToken(endpoint, token)
  }

  /** Get the current credential for an account before handing it to another consumer. */
  public async getAccountWithFreshToken(
    account: Account,
    minimumValidity = refreshMargin
  ): Promise<Account> {
    await this.loadingPromise
    const token = await this.credentials.getFreshToken(account, minimumValidity)
    const current = this.accounts.find(a => a.endpoint === account.endpoint)
    if (current === undefined || current.id !== account.id) {
      throw new AccountRequiresSignInError()
    }
    return this.credentials.inheritSession(current, current.withToken(token))
  }

  /**
   * Get the account's credential for `holder`, holding off renewal of that
   * token until the lease is released. See `CredentialSessions.leaseToken`.
   */
  public async leaseAccountToken(
    account: Account,
    holder: string
  ): Promise<{ readonly account: Account; readonly release: () => void }> {
    await this.loadingPromise
    const lease = await this.credentials.leaseToken(account, holder)
    const current = this.accounts.find(a => a.endpoint === account.endpoint)
    if (current === undefined || current.id !== account.id) {
      lease.release()
      throw new AccountRequiresSignInError()
    }
    return {
      account: this.credentials.inheritSession(
        current,
        current.withToken(lease.token)
      ),
      release: lease.release,
    }
  }

  /** Whether an account owns a rotating credential pair. */
  public isRefreshable(account: Account): boolean {
    return this.credentials.isRefreshable(account)
  }

  /**
   * Bind fresh access tokens and expiry metadata to the account's issuing session.
   *
   * Throws if the account snapshot is unknown or its session has retired.
   */
  public createTokenGetter(
    account: Account,
    minimumValidity = refreshMargin
  ): () => Promise<Pick<IOAuthToken, 'accessToken' | 'expiresAt'>> {
    return this.credentials.createTokenGetter(account, minimumValidity)
  }

  /** Ignore obsolete 401s; sign out when the current token is rejected. */
  public async invalidateToken(endpoint: string, token: string): Promise<void> {
    await this.loadingPromise
    await this.credentials.invalidateToken(endpoint, token)
  }

  /**
   * Revoke an unused credential, even if account lookup has not completed.
   *
   * Cleanup is bounded and failures are logged. Callers need not await it, but
   * must only pass credentials that have not been installed for an account.
   */
  public revokeUnusedToken(
    account: Pick<Account, 'endpoint' | 'token'>
  ): Promise<void> {
    return this.credentials.revokeUnusedToken(account)
  }

  /** Sign out an account whose credential can no longer be used. */
  private requireSignIn = async (account: Account): Promise<Account | null> => {
    const retired = this.retireAccount(account)
    if (retired === null) {
      return null
    }
    log.info(
      `[AccountsStore] signing out account ${retired.login} (${retired.name}) because its credentials can no longer be used`
    )
    this.emitter.emit(
      'token-invalidated',
      this.credentials.inheritSession(account, account.withToken(''))
    )
    await this.deleteStoredAccount(retired)
    return retired
  }

  private onTokenRenewed = (endpoint: string, accessToken: string) => {
    this.accounts = this.accounts.map(a =>
      a.endpoint === endpoint
        ? this.credentials.inheritSession(a, a.withToken(accessToken))
        : a
    )
    this.save()
  }

  private onSignedIn = (account: Account) => {
    this.accounts = sortAccounts([
      ...this.accounts.filter(a => a.endpoint !== account.endpoint),
      account,
    ])
    this.save()
  }

  /**
   * Add the account to the store.
   *
   * Returns a new signed-in snapshot. Previous snapshots retain their old session.
   */
  public async addAccount(
    account: Account,
    credential: IOAuthToken = { accessToken: account.token }
  ): Promise<Account | null> {
    await this.loadingPromise
    let authenticatedAccount: Account
    try {
      authenticatedAccount = await this.credentials.add(account, credential)
    } catch (e) {
      log.error('Unable to save GitHub credentials in secure storage.')

      if (__DARWIN__ && isKeyChainError(e)) {
        this.emitError(
          new Error(
            `GitHub Desktop was unable to store the account token in the keychain. Please check you have unlocked access to the 'login' keychain.`
          )
        )
      } else {
        this.emitError(
          new Error('Unable to save GitHub credentials in secure storage.')
        )
      }
      return null
    }

    return authenticatedAccount
  }

  /** Refresh all accounts by fetching their latest info from the API. */
  public async refresh(): Promise<void> {
    await this.loadingPromise
    await Promise.all(this.accounts.map(acc => this.tryUpdateAccount(acc)))
  }

  /**
   * Refresh profile data without resurrecting a removed account or replacing
   * credentials that rotated while the profile request was in flight.
   */
  private async tryUpdateAccount(account: Account): Promise<void> {
    const currentToken = this.credentials.trackToken(account.endpoint)
    try {
      const fresh = await this.getAccountWithFreshToken(account)
      const updated = await updatedAccount(fresh)
      const token = currentToken()
      if (token !== null) {
        this.accounts = this.accounts.map(a =>
          a.endpoint === account.endpoint
            ? this.credentials.inheritSession(a, updated.withToken(token))
            : a
        )
        this.save()
      }
    } catch (e) {
      log.warn(`Error refreshing account '${account.login}'`, e)
    }
  }

  private retireAccount(account: Account): Account | null {
    const current = this.accounts.find(a => a.endpoint === account.endpoint)
    if (current === undefined || current.id !== account.id) {
      return null
    }
    this.credentials.retire(account.endpoint)
    this.accounts = this.accounts.filter(a => a.endpoint !== account.endpoint)
    this.save()
    return current
  }

  private async deleteStoredAccount(account: Account): Promise<void> {
    try {
      await this.credentials.delete(account)
    } catch {
      log.error('Unable to remove GitHub credentials from secure storage.')
      this.emitError(
        new Error('Unable to remove GitHub credentials from secure storage.')
      )
    }
  }

  /**
   * Remove an account and return its credential snapshot for remote revocation.
   *
   * Capture and retire the current session without yielding so renewal cannot
   * publish a token between those steps. Return the snapshot even if deleting
   * secure storage fails, or null if this account is no longer installed.
   */
  public async removeAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise
    const current = this.retireAccount(account)
    if (current !== null) {
      await this.deleteStoredAccount(current)
    }
    return current
  }

  private getMigratedGHEAccounts(
    accounts: ReadonlyArray<IAccount>
  ): ReadonlyArray<IAccount> | null {
    let migrated = false
    const migratedAccounts = accounts.map(account => {
      let endpoint = account.endpoint
      const endpointURL = new URL(endpoint)
      // Migrate endpoints of subdomains of `.ghe.com` that use the `/api/v3`
      // path to the correct URL using the `api.` subdomain.
      if (isGHE(endpoint) && !endpointURL.hostname.startsWith('api.')) {
        endpoint = getEnterpriseAPIURL(endpoint)
        migrated = true
      }

      return {
        ...account,
        endpoint,
      }
    })

    return migrated ? migratedAccounts : null
  }

  /**
   * Load the users into memory from storage.
   */
  private async loadFromStore(): Promise<void> {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const parsedAccounts: ReadonlyArray<IAccount> = JSON.parse(raw)
    const migratedAccounts = this.getMigratedGHEAccounts(parsedAccounts)
    const rawAccounts = migratedAccounts ?? parsedAccounts

    // Duplicate endpoints keep the last entry, like CredentialSessions.restore.
    const accountsByEndpoint = new Map<string, Account>()
    let removedInvalidAccounts = false
    for (const account of rawAccounts) {
      const accountWithoutToken = new Account(
        account.login,
        account.endpoint,
        '',
        account.emails,
        account.avatarURL,
        account.id,
        account.name,
        account.plan
      )

      const key = getKeyForAccount(accountWithoutToken)
      try {
        const stored = await this.secureStore.getItem(key, account.login)
        const credential = deserializeAccountCredential(stored)
        if (credential === null && stored !== null) {
          removedInvalidAccounts = true
          try {
            await this.secureStore.deleteItem(key, account.login)
          } catch {
            log.error('Unable to remove unusable GitHub credentials.')
            this.emitError(
              new Error('Unable to remove unusable GitHub credentials.')
            )
          }
          continue
        }
        const loaded = accountWithoutToken.withToken(
          credential?.accessToken ?? ''
        )
        const restored = this.credentials.restore(loaded, credential)
        accountsByEndpoint.set(restored.endpoint, restored)
      } catch (e) {
        log.error(`Error getting token for '${key}'. Skipping.`, e)

        this.emitError(e)
      }
    }

    this.accounts = sortAccounts([...accountsByEndpoint.values()])
    // If any account was migrated, make sure to persist the new value
    if (migratedAccounts !== null || removedInvalidAccounts) {
      this.save() // Save already emits an update
    } else {
      this.emitUpdate(this.accounts)
    }
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account =>
      account.withToken('')
    )
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))

    this.emitUpdate(this.accounts)
  }
}

async function updatedAccount(account: Account): Promise<Account> {
  if (!account.token) {
    return fatalError(
      `Cannot update an account which doesn't have a token: ${account.login}`
    )
  }

  return fetchUser(account.endpoint, account.token)
}
