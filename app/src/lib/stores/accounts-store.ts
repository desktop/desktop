import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../auth'
import { Account, isDotComAccount } from '../../models/account'
import { fetchUser, EmailVisibility, getEnterpriseAPIURL } from '../api'
import { fatalError } from '../fatal-error'
import { TypedBaseStore } from './base-store'
import { isGHE } from '../endpoint-capabilities'
import { compare, compareDescending } from '../compare'
import { Disposable } from 'event-kit'
import { deleteToken, getHTMLURL } from '../api'
import {
  IOAuthToken,
  OAuthRefreshRejectedError,
  OAuthTokenResponseError,
  refreshOAuthToken,
} from '../oauth-token'
import {
  AccountCredential,
  deserializeAccountCredential,
  serializeAccountCredential,
} from '../account-credential'

const refreshMargin = 10 * 60 * 1000
const revocationTimeout = 30_000

interface ICredentialSession {
  readonly account: Account
  credential: AccountCredential
  retired: boolean
  notified: boolean
  refreshing?: Promise<string>
  retryAfter?: number
}

/** Authentication cannot proceed until the user signs in again. */
export class AccountRequiresSignInError extends Error {
  public constructor() {
    super('Your GitHub session could not be renewed. Please sign in again.')
  }
}

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
  private readonly sessions = new Map<string, ICredentialSession>()
  private readonly tokenSessions = new Map<string, ICredentialSession>()
  private readonly writes = new Map<string, Promise<void>>()
  private readonly versions = new Map<string, number>()

  /** A promise that will resolve when the accounts have been loaded. */
  private loadingPromise: Promise<void>

  public constructor(
    dataStore: IDataStore,
    secureStore: ISecureStore,
    private readonly renewToken = refreshOAuthToken,
    private readonly now = Date.now,
    private readonly revokeToken = deleteToken
  ) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
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
    const session = this.tokenSessions.get(this.tokenKey(endpoint, token))
    const current = this.sessions.get(endpoint)
    if (token === '' && current?.credential === null) {
      return this.validToken(current)
    }
    return session === undefined ? token : this.validToken(session)
  }

  /** Get the current credential for an account before handing it to another consumer. */
  public async getAccountWithFreshToken(
    account: Account,
    minimumValidity = refreshMargin
  ): Promise<Account> {
    await this.loadingPromise
    const session = this.sessions.get(account.endpoint)
    if (session === undefined || session.account.id !== account.id) {
      throw new AccountRequiresSignInError()
    }
    const token = await this.validToken(session, minimumValidity)
    const current = this.accounts.find(a => a.endpoint === account.endpoint)
    if (current === undefined || current.id !== account.id || session.retired) {
      throw new AccountRequiresSignInError()
    }
    return current.withToken(token)
  }

  /** Whether an account owns a rotating credential pair. */
  public isRefreshable(account: Account): boolean {
    const session = this.sessions.get(account.endpoint)
    return (
      session?.account.id === account.id &&
      session.credential?.refreshToken !== undefined
    )
  }

  /** Access-token expiry for consumers that support on-demand token renewal. */
  public getTokenExpiration(account: Account): number | undefined {
    const session = this.sessions.get(account.endpoint)
    return session?.account.id === account.id
      ? session.credential?.expiresAt
      : undefined
  }

  /** Ignore obsolete 401s; sign out when the current token is rejected. */
  public async invalidateToken(endpoint: string, token: string): Promise<void> {
    await this.loadingPromise
    const session = this.sessions.get(endpoint)
    if (session === undefined || session.credential?.accessToken !== token) {
      return
    }
    // A request using the previous pair can finish while rotation is in flight.
    if (session.refreshing !== undefined) {
      try {
        await session.refreshing
      } catch {
        // The renewal path reports its own failure and preserves its classification.
        return
      }
      if (session.credential?.accessToken !== token) {
        return
      }
    }
    const retired = await this.requireSignIn(session)
    if (retired !== null) {
      void this.revokeUnusedToken(retired)
    }
  }

  private tokenKey(endpoint: string, token: string) {
    return `${endpoint}\0${token}`
  }

  private installSession(account: Account, credential: AccountCredential) {
    const session: ICredentialSession = {
      account,
      credential,
      retired: false,
      notified: false,
    }
    this.sessions.set(account.endpoint, session)
    if (credential !== null) {
      this.tokenSessions.set(
        this.tokenKey(account.endpoint, credential.accessToken),
        session
      )
    }
  }

  private retireSession(endpoint: string) {
    const previous = this.sessions.get(endpoint)
    if (previous !== undefined) {
      previous.retired = true
      previous.credential = null
    }
    this.sessions.delete(endpoint)
    const version = (this.versions.get(endpoint) ?? 0) + 1
    this.versions.set(endpoint, version)
    return version
  }

  private async write(
    endpoint: string,
    action: () => Promise<void>
  ): Promise<void> {
    const previous = this.writes.get(endpoint)
    const next = (previous ?? Promise.resolve()).then(action)
    // The caller receives the error; the queue must remain usable for sign-out.
    const settled = next.catch(() => {})
    this.writes.set(endpoint, settled)
    try {
      await next
    } finally {
      if (this.writes.get(endpoint) === settled) {
        this.writes.delete(endpoint)
      }
    }
  }

  private async validToken(
    session: ICredentialSession,
    minimumValidity = refreshMargin
  ): Promise<string> {
    if (session.retired) {
      throw new AccountRequiresSignInError()
    }
    const credential = session.credential
    if (credential === null) {
      await this.requireSignIn(session)
      throw new AccountRequiresSignInError()
    }
    // Rotation invalidates the old pair even if this caller needs less validity.
    if (session.refreshing !== undefined) {
      return session.refreshing
    }
    if (
      credential.refreshToken === undefined ||
      (credential.expiresAt !== undefined &&
        credential.expiresAt > this.now() + minimumValidity)
    ) {
      return credential.accessToken
    }
    if (session.retryAfter !== undefined && this.now() < session.retryAfter) {
      throw new Error(
        'Unable to renew your GitHub session. Check your connection and try again shortly.'
      )
    }
    const refreshing = this.rotate(session, credential)
    session.refreshing = refreshing
    try {
      return await refreshing
    } finally {
      session.refreshing = undefined
    }
  }

  private async rotate(
    session: ICredentialSession,
    credential: IOAuthToken
  ): Promise<string> {
    const { account } = session
    const refreshToken = credential.refreshToken
    if (refreshToken === undefined) {
      throw new Error('Cannot renew a credential without a refresh token.')
    }
    let renewed: IOAuthToken
    try {
      renewed = await this.renewToken(
        getHTMLURL(account.endpoint),
        refreshToken
      )
    } catch (e) {
      if (!session.retired) {
        if (
          e instanceof OAuthRefreshRejectedError ||
          e instanceof OAuthTokenResponseError
        ) {
          await this.requireSignIn(session)
        } else {
          session.retryAfter = this.now() + 30_000
          log.warn(
            'OAuth renewal failed; retaining credentials for a later retry.'
          )
        }
      }
      throw e
    }

    if (session.retired) {
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new AccountRequiresSignInError()
    }
    try {
      await this.write(account.endpoint, async () => {
        if (session.retired) {
          throw new AccountRequiresSignInError()
        }
        await this.secureStore.setItem(
          getKeyForAccount(account),
          account.login,
          serializeAccountCredential(renewed)
        )
      })
    } catch {
      if (!session.retired) {
        await this.requireSignIn(session)
      }
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new Error(
        'Unable to save renewed GitHub credentials. Please sign in again.'
      )
    }
    if (session.retired) {
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new AccountRequiresSignInError()
    }
    session.credential = renewed
    session.retryAfter = undefined
    this.tokenSessions.set(
      this.tokenKey(account.endpoint, renewed.accessToken),
      session
    )
    this.accounts = this.accounts.map(a =>
      a.endpoint === account.endpoint ? a.withToken(renewed.accessToken) : a
    )
    this.save()
    log.info('OAuth credentials renewed and saved.')
    return renewed.accessToken
  }

  /**
   * Revoke an unused credential, even if account lookup has not completed.
   *
   * Cleanup is bounded and failures are logged. Callers need not await it, but
   * must only pass credentials that have not been installed for an account.
   */
  public async revokeUnusedToken(
    account: Pick<Account, 'endpoint' | 'token'>
  ): Promise<void> {
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        controller.abort()
        reject(new Error('OAuth revocation timed out.'))
      }, revocationTimeout)
    })
    try {
      const revoked = await Promise.race([
        this.revokeToken(account, controller.signal),
        deadline,
      ])
      if (!revoked) {
        log.warn('Unable to revoke unused OAuth credentials.')
      }
    } catch {
      log.warn('Unable to revoke unused OAuth credentials.')
    } finally {
      clearTimeout(timeout)
    }
  }

  private notifyTokenInvalidated(session: ICredentialSession) {
    if (!session.notified) {
      session.notified = true
      this.emitter.emit('token-invalidated', session.account.withToken(''))
    }
  }

  private async requireSignIn(
    session: ICredentialSession
  ): Promise<Account | null> {
    if (this.sessions.get(session.account.endpoint) !== session) {
      return null
    }
    const retired = this.retireAccount(session.account)
    if (retired === null) {
      return null
    }
    this.notifyTokenInvalidated(session)
    await this.deleteStoredAccount(retired)
    return retired
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(
    account: Account,
    credential: IOAuthToken = { accessToken: account.token },
    isCurrent: () => boolean = () => true
  ): Promise<Account | null> {
    await this.loadingPromise
    const version = this.retireSession(account.endpoint)
    try {
      const key = getKeyForAccount(account)
      await this.write(account.endpoint, async () => {
        if (this.versions.get(account.endpoint) === version && isCurrent()) {
          await this.secureStore.setItem(
            key,
            account.login,
            serializeAccountCredential(credential)
          )
          if (!isCurrent()) {
            await this.secureStore.deleteItem(key, account.login)
          }
        }
      })
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
    if (this.versions.get(account.endpoint) !== version || !isCurrent()) {
      return null
    }
    const authenticatedAccount = account.withToken(credential.accessToken)
    this.installSession(authenticatedAccount, credential)

    const accountsByEndpoint = this.accounts.reduce(
      (map, x) => map.set(x.endpoint, x),
      new Map<string, Account>()
    )
    accountsByEndpoint.set(account.endpoint, authenticatedAccount)

    this.accounts = sortAccounts([...accountsByEndpoint.values()])

    this.save()
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
    const session = this.sessions.get(account.endpoint)
    try {
      const fresh = await this.getAccountWithFreshToken(account)
      const updated = await updatedAccount(fresh)
      if (
        session !== undefined &&
        !session.retired &&
        session.credential !== null
      ) {
        const token = session.credential.accessToken
        this.accounts = this.accounts.map(a =>
          a.endpoint === account.endpoint ? updated.withToken(token) : a
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
    this.retireSession(account.endpoint)
    this.accounts = this.accounts.filter(a => a.endpoint !== account.endpoint)
    this.save()
    return current
  }

  private async deleteStoredAccount(account: Account): Promise<void> {
    try {
      await this.write(account.endpoint, async () => {
        await this.secureStore.deleteItem(
          getKeyForAccount(account),
          account.login
        )
      })
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

    const accountsWithTokens = []
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
        accountsWithTokens.push(loaded)
        this.installSession(loaded, credential)
      } catch {
        log.error('Unable to read GitHub credentials from secure storage.')
        this.emitError(
          new Error(
            'Unable to read GitHub credentials from secure storage. Please sign in again.'
          )
        )
        accountsWithTokens.push(accountWithoutToken)
        this.installSession(accountWithoutToken, null)
      }
    }

    this.accounts = sortAccounts(accountsWithTokens)
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
