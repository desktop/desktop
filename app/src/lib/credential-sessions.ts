import { ISecureStore } from './stores/stores'
import { getKeyForAccount } from './auth'
import { Account } from '../models/account'
import { deleteToken, getHTMLURL } from './api'
import {
  IOAuthToken,
  OAuthRefreshRejectedError,
  OAuthTokenResponseError,
  refreshOAuthToken,
} from './oauth-token'
import {
  AccountCredential,
  serializeAccountCredential,
} from './account-credential'

/** Renew credentials that expire within this window before handing them out. */
export const refreshMargin = 10 * 60 * 1000
const revocationTimeout = 30_000

/** Authentication cannot proceed until the user signs in again. */
export class AccountRequiresSignInError extends Error {
  public constructor() {
    super('Your GitHub session could not be renewed. Please sign in again.')
  }
}

interface ICredentialSession {
  readonly account: Account
  credential: AccountCredential
  retired: boolean
  refreshing?: Promise<string>
}

/** Account-list changes that credential sessions ask their owner to perform. */
export interface ICredentialSessionsDelegate {
  /**
   * Sign the account out because its credential can no longer be used.
   *
   * Must call `retire` synchronously before its first `await`. Returns the
   * removed account, or null if it was no longer installed.
   */
  readonly requireSignIn: (account: Account) => Promise<Account | null>

  /** A renewed access token for the endpoint was saved and installed. */
  readonly onTokenRenewed: (endpoint: string, accessToken: string) => void
}

/**
 * Credential lifecycle for signed-in accounts: one session per endpoint.
 *
 * Owns token renewal, lookup of stale token copies, rejected-token handling,
 * and ordered secure-storage writes. The account list stays with the owner,
 * which is told through `ICredentialSessionsDelegate` when it must change.
 */
export class CredentialSessions {
  /** Signed-in session for each endpoint: account, credential, renewal state. */
  private readonly sessionsByEndpoint = new Map<string, ICredentialSession>()
  /**
   * Session that issued each access token, keyed by `tokenKey`. API clients
   * keep the token they were created with; this maps that copy (even after
   * rotation) back to its session so `resolveToken` can return the current one.
   */
  private readonly sessionsByToken = new Map<string, ICredentialSession>()
  /** Per-endpoint queue so secure-storage saves and deletes never interleave. */
  private readonly credentialWriteQueues = new Map<string, Promise<void>>()
  /**
   * Per-endpoint counter bumped when a sign-in starts or a session is removed.
   * `add` compares it after awaiting storage to drop stale sign-ins.
   */
  private readonly sessionGenerations = new Map<string, number>()

  public constructor(
    private readonly secureStore: ISecureStore,
    private readonly delegate: ICredentialSessionsDelegate,
    private readonly renewToken = refreshOAuthToken,
    private readonly now = Date.now,
    private readonly revokeToken = deleteToken
  ) {}

  /** Install a credential that was read back from secure storage. */
  public restore(account: Account, credential: AccountCredential) {
    const session: ICredentialSession = { account, credential, retired: false }
    this.sessionsByEndpoint.set(account.endpoint, session)
    if (credential !== null) {
      this.sessionsByToken.set(
        this.tokenKey(account.endpoint, credential.accessToken),
        session
      )
    }
  }

  /**
   * Save and install a new credential, replacing any session for its endpoint.
   *
   * The current session stays usable until the new credential is saved, so a
   * failed save leaves it untouched. Returns the account carrying the
   * credential's access token, or null if another sign-in or a sign-out
   * superseded this one while storage was pending. Throws if secure storage
   * fails.
   */
  public async add(
    account: Account,
    credential: IOAuthToken
  ): Promise<Account | null> {
    const { endpoint } = account
    const generation = this.nextGeneration(endpoint)
    const isLatest = () => this.sessionGenerations.get(endpoint) === generation
    const authenticated = account.withToken(credential.accessToken)
    let installed = false
    await this.write(endpoint, async () => {
      if (!isLatest()) {
        return
      }
      await this.secureStore.setItem(
        getKeyForAccount(account),
        account.login,
        serializeAccountCredential(credential)
      )
      // Swap inside the write so a renewal of the replaced session queued
      // behind it sees the retirement and cannot overwrite this credential.
      if (isLatest()) {
        this.retirePrevious(endpoint)
        this.restore(authenticated, credential)
        installed = true
      }
    })
    return installed ? authenticated : null
  }

  /** Stop using the endpoint's session so no caller can obtain its token again. */
  public retire(endpoint: string): void {
    this.retireSession(endpoint)
  }

  /** Delete the account's stored credential after any pending write. */
  public delete(account: Account): Promise<void> {
    return this.write(account.endpoint, async () => {
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    })
  }

  private retireSession(endpoint: string): void {
    this.retirePrevious(endpoint)
    this.nextGeneration(endpoint)
  }

  private retirePrevious(endpoint: string): void {
    const previous = this.sessionsByEndpoint.get(endpoint)
    if (previous !== undefined) {
      previous.retired = true
      previous.credential = null
    }
    this.sessionsByEndpoint.delete(endpoint)
  }

  private nextGeneration(endpoint: string): number {
    const generation = (this.sessionGenerations.get(endpoint) ?? 0) + 1
    this.sessionGenerations.set(endpoint, generation)
    return generation
  }

  /** Resolve token snapshots held by long-lived clients without changing identity. */
  public resolveToken(endpoint: string, token: string): Promise<string> {
    const session = this.sessionsByToken.get(this.tokenKey(endpoint, token))
    const current = this.sessionsByEndpoint.get(endpoint)
    if (token === '' && current?.credential === null) {
      return this.validToken(current)
    }
    return session === undefined
      ? Promise.resolve(token)
      : this.validToken(session)
  }

  /**
   * Get an access token for the account valid for at least `minimumValidity`.
   *
   * Throws `AccountRequiresSignInError` if the account has no usable session.
   */
  public async getFreshToken(
    account: Account,
    minimumValidity = refreshMargin
  ): Promise<string> {
    const session = this.sessionsByEndpoint.get(account.endpoint)
    if (session === undefined || session.account.id !== account.id) {
      throw new AccountRequiresSignInError()
    }
    const token = await this.validToken(session, minimumValidity)
    if (session.retired) {
      throw new AccountRequiresSignInError()
    }
    return token
  }

  /**
   * Follow the endpoint's current session across renewals.
   *
   * The returned function yields that session's access token, or null once it
   * is retired, so a slow caller never adopts a later sign-in's token.
   */
  public trackToken(endpoint: string): () => string | null {
    const session = this.sessionsByEndpoint.get(endpoint)
    return () =>
      session === undefined || session.retired
        ? null
        : session.credential?.accessToken ?? null
  }

  /** Whether an account owns a rotating credential pair. */
  public isRefreshable(account: Account): boolean {
    const session = this.sessionsByEndpoint.get(account.endpoint)
    return (
      session?.account.id === account.id &&
      session.credential?.refreshToken !== undefined
    )
  }

  /** Access-token expiry for consumers that support on-demand token renewal. */
  public getTokenExpiration(account: Account): number | undefined {
    const session = this.sessionsByEndpoint.get(account.endpoint)
    return session?.account.id === account.id
      ? session.credential?.expiresAt
      : undefined
  }

  /** Ignore obsolete 401s; sign out when the current token is rejected. */
  public async invalidateToken(endpoint: string, token: string): Promise<void> {
    const session = this.sessionsByEndpoint.get(endpoint)
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

  private tokenKey(endpoint: string, token: string) {
    return `${endpoint}\0${token}`
  }

  private async write(
    endpoint: string,
    action: () => Promise<void>
  ): Promise<void> {
    const previous = this.credentialWriteQueues.get(endpoint)
    const next = (previous ?? Promise.resolve()).then(action)
    // The caller receives the error; the queue must remain usable for sign-out.
    const settled = next.catch(() => {})
    this.credentialWriteQueues.set(endpoint, settled)
    try {
      await next
    } finally {
      if (this.credentialWriteQueues.get(endpoint) === settled) {
        this.credentialWriteQueues.delete(endpoint)
      }
    }
  }

  private requireSignIn(session: ICredentialSession): Promise<Account | null> {
    if (this.sessionsByEndpoint.get(session.account.endpoint) !== session) {
      return Promise.resolve(null)
    }
    return this.delegate.requireSignIn(session.account)
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
          log.warn(
            'OAuth renewal failed; retaining credentials for a later retry.'
          )
          throw new Error(
            'Unable to renew your GitHub session. Check your connection and try again shortly.'
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
    this.sessionsByToken.set(
      this.tokenKey(account.endpoint, renewed.accessToken),
      session
    )
    this.delegate.onTokenRenewed(account.endpoint, renewed.accessToken)
    log.info('OAuth credentials renewed and saved.')
    return renewed.accessToken
  }
}
