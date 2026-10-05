import { ISecureStore } from './stores/stores'
import { getKeyForAccount } from './auth'
import { Account, accountEquals } from '../models/account'
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
/** Stop waiting for a leased token's holders once it is this close to expiring. */
const leasedRenewalMargin = 60 * 1000
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
  /** Leases on access tokens that are in use, such as by running Git processes. */
  readonly leases: Set<ILease>
  /** Callers waiting for a leased token to be released or the session to retire. */
  readonly leaseWaiters: Set<() => void>
}

interface ILease {
  readonly token: string
  readonly holder: string
}

/** An access token that is not renewed until it is released. */
export interface ITokenLease {
  readonly token: string
  /** Stop holding the token. Safe to call more than once. */
  readonly release: () => void
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

  /**
   * A sign-in was saved and installed, replacing any session for its endpoint.
   *
   * Called synchronously with the swap, so the owner's account list never
   * disagrees with the installed session.
   */
  readonly onSignedIn: (account: Account) => void
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
  /** Immutable account snapshots retain their issuing session across token reuse. */
  private readonly sessionsByAccount = new WeakMap<
    Account,
    ICredentialSession
  >()
  /** Per-endpoint queue so secure-storage saves and deletes never interleave. */
  private readonly credentialWriteQueues = new Map<string, Promise<void>>()

  public constructor(
    private readonly secureStore: ISecureStore,
    private readonly delegate: ICredentialSessionsDelegate,
    private readonly renewToken = refreshOAuthToken,
    private readonly now = Date.now,
    private readonly revokeToken = deleteToken
  ) {}

  /**
   * Install a credential and return its account snapshot.
   *
   * An already-associated snapshot keeps its original session; restoring it
   * again creates a distinct snapshot, even when its token is unchanged.
   */
  public restore(account: Account, credential: AccountCredential): Account {
    const restored = this.sessionsByAccount.has(account)
      ? account.withToken(account.token)
      : account
    const session: ICredentialSession = {
      account: restored,
      credential,
      retired: false,
      leases: new Set(),
      leaseWaiters: new Set(),
    }
    this.retireSession(account.endpoint)
    this.sessionsByEndpoint.set(account.endpoint, session)
    this.sessionsByAccount.set(restored, session)
    if (credential !== null) {
      this.sessionsByToken.set(
        this.tokenKey(account.endpoint, credential.accessToken),
        session
      )
    }
    return restored
  }

  /**
   * Save and install a new credential, replacing any session for its endpoint.
   *
   * Saves run in call order and each one is installed as soon as it succeeds,
   * so memory always matches the last successful save. A failed save leaves
   * the current session untouched. Returns the account carrying the
   * credential's access token. Throws if secure storage fails.
   */
  public async add(
    account: Account,
    credential: IOAuthToken
  ): Promise<Account> {
    const authenticated = account.withToken(credential.accessToken)
    await this.write(account.endpoint, async () => {
      await this.secureStore.setItem(
        getKeyForAccount(account),
        account.login,
        serializeAccountCredential(credential)
      )
      // Swap inside the write so a renewal of the replaced session queued
      // behind it sees the retirement and cannot overwrite this credential.
      this.retireSession(account.endpoint)
      this.restore(authenticated, credential)
      if (!this.sessionsByAccount.has(account)) {
        this.inheritSession(authenticated, account)
      }
      this.delegate.onSignedIn(authenticated)
    })
    return authenticated
  }

  /** Stop using the endpoint's session so no caller can obtain its token again. */
  public retire(endpoint: string): void {
    this.retireSession(endpoint)
  }

  /**
   * Delete the account's stored credential after any pending write.
   *
   * Skipped if a later sign-in with the same login has been installed since:
   * the stored item now holds that sign-in's credential.
   */
  public delete(account: Account): Promise<void> {
    return this.write(account.endpoint, async () => {
      const current = this.sessionsByEndpoint.get(account.endpoint)
      if (current?.account.login === account.login) {
        return
      }
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    })
  }

  private retireSession(endpoint: string): void {
    const previous = this.sessionsByEndpoint.get(endpoint)
    if (previous !== undefined) {
      previous.retired = true
      previous.credential = null
      this.notifyLeaseWaiters(previous)
    }
    this.sessionsByEndpoint.delete(endpoint)
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
   * If the token needs renewing while it is leased, waits for its holders to
   * release it first. See `leaseToken`.
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

  /** Preserve the issuing session when publishing an immutable account copy. */
  public inheritSession(original: Account, updated: Account): Account {
    const session = this.sessionsByAccount.get(original)
    const previous = this.sessionsByAccount.get(updated)
    if (
      session === undefined ||
      !accountEquals(original, updated) ||
      (previous !== undefined && previous !== session)
    ) {
      throw new AccountRequiresSignInError()
    }
    this.sessionsByAccount.set(updated, session)
    return updated
  }

  /**
   * Bind access-token acquisition and expiry metadata to the account's session.
   *
   * Follows token rotation within the issuing session, but permanently rejects
   * once that session retires, even if the same user signs in again.
   * Throws at creation if the snapshot is unknown or its session has retired.
   */
  public createTokenGetter(
    account: Account,
    minimumValidity = refreshMargin
  ): () => Promise<Pick<IOAuthToken, 'accessToken' | 'expiresAt'>> {
    const session = this.sessionsByAccount.get(account)
    if (
      session === undefined ||
      session.retired ||
      !accountEquals(session.account, account)
    ) {
      throw new AccountRequiresSignInError()
    }
    return async () => {
      for (;;) {
        const token = await this.validToken(session, minimumValidity)
        if (session.retired) {
          throw new AccountRequiresSignInError()
        }
        const credential = session.credential
        // A concurrent rotation must not pair an old token with the new expiry.
        if (
          session.refreshing === undefined &&
          credential?.accessToken === token
        ) {
          return { accessToken: token, expiresAt: credential.expiresAt }
        }
      }
    }
  }

  /**
   * Get an access token for `holder` and hold off renewing it until the lease
   * is released.
   *
   * Renewal revokes the previous access token, but some consumers keep using
   * the token they were given: Git reuses a credential for every request a
   * process makes. Anyone who needs a leased token renewed waits until every
   * holder releases it, or until it is about to expire anyway, except a holder
   * of that token, which gets it again instead. If renewal fails for a reason other than
   * the account being signed out, the current token is used while it is
   * unexpired.
   *
   * Throws `AccountRequiresSignInError` if the account has no usable session.
   */
  public async leaseToken(
    account: Account,
    holder: string,
    minimumValidity = refreshMargin
  ): Promise<ITokenLease> {
    for (;;) {
      const session = this.sessionsByEndpoint.get(account.endpoint)
      if (session === undefined || session.account.id !== account.id) {
        throw new AccountRequiresSignInError()
      }
      let token: string
      try {
        token = await this.validToken(session, minimumValidity, holder)
      } catch (e) {
        const credential = session.credential
        if (session.retired || e instanceof AccountRequiresSignInError) {
          throw new AccountRequiresSignInError()
        }
        if (
          credential === null ||
          (credential.expiresAt !== undefined &&
            credential.expiresAt <= this.now())
        ) {
          throw e
        }
        log.warn('OAuth renewal failed; using the current credentials.')
        token = credential.accessToken
      }
      if (session.retired) {
        throw new AccountRequiresSignInError()
      }
      // A renewal that started while this caller waited would revoke `token`.
      if (
        session.refreshing === undefined &&
        session.credential?.accessToken === token
      ) {
        const lease: ILease = { token, holder }
        session.leases.add(lease)
        const release = () => {
          if (session.leases.delete(lease)) {
            this.notifyLeaseWaiters(session)
          }
        }
        return { token, release }
      }
    }
  }

  /**
   * Resolve once a lease may have been released, the credential is about to
   * expire, or the session is retired. Callers must check the session again.
   */
  private waitForLeaseRelease(
    session: ICredentialSession,
    credential: IOAuthToken
  ): Promise<void> {
    return new Promise(resolve => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      const done = () => {
        clearTimeout(timeout)
        session.leaseWaiters.delete(done)
        resolve()
      }
      session.leaseWaiters.add(done)
      if (credential.expiresAt !== undefined) {
        timeout = setTimeout(
          done,
          credential.expiresAt - leasedRenewalMargin - this.now()
        )
      }
    })
  }

  private notifyLeaseWaiters(session: ICredentialSession) {
    for (const done of [...session.leaseWaiters]) {
      done()
    }
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
    const session = this.sessionsByAccount.get(account)
    return (
      session !== undefined &&
      !session.retired &&
      session.credential?.refreshToken !== undefined
    )
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
    minimumValidity = refreshMargin,
    holder?: string
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
    const holders = this.leaseHolders(session, credential)
    // Renewing would revoke the token this holder is still using.
    if (holder !== undefined && holders.includes(holder)) {
      return credential.accessToken
    }
    if (holders.length > 0) {
      await this.waitForLeaseRelease(session, credential)
      return this.validToken(session, minimumValidity, holder)
    }
    const refreshing = this.rotate(session, credential)
    session.refreshing = refreshing
    try {
      return await refreshing
    } finally {
      session.refreshing = undefined
    }
  }

  /** Holders of the credential's token, unless it is about to expire anyway. */
  private leaseHolders(
    session: ICredentialSession,
    credential: IOAuthToken
  ): ReadonlyArray<string> {
    if (
      credential.expiresAt !== undefined &&
      credential.expiresAt <= this.now() + leasedRenewalMargin
    ) {
      return []
    }
    return [...session.leases]
      .filter(l => l.token === credential.accessToken)
      .map(l => l.holder)
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
