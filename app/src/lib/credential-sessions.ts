import { ISecureStore } from './stores/stores'
import { getKeyForAccount } from './auth'
import { Account, accountEquals, getAccountKey } from '../models/account'
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
import { enableTestMenuItems } from './feature-flag'

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
  expirationOverride?: { readonly originalExpiresAt: number | undefined }
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

/** Token expiration metadata for the test dialog, without credential values. */
export interface IAccountTokenExpiration {
  /** Whether the current credential has a refresh token. */
  readonly isRefreshable: boolean
  /** Current local expiration, in milliseconds since the Unix epoch. */
  readonly expiresAt: number | undefined
  /** Expiration before overriding; undefined means the expiry was unknown. */
  readonly originalExpiresAt: number | undefined
  /** Whether the current session has a local expiration override. */
  readonly isOverridden: boolean
}

/** Credential-free lifecycle events for actual token refresh exchanges. */
export type TokenRefreshEvent =
  | 'attempt'
  | 'success'
  | 'transient-failure'
  | 'non-transient-failure'
  | 'abandoned'
  | 'required-sign-in'

/** Account-list changes that credential sessions ask their owner to perform. */
export interface ICredentialSessionsDelegate {
  /** A renewal lifecycle event; excludes expiry-override testing. */
  readonly onTokenRefreshEvent?: (event: TokenRefreshEvent) => void

  /**
   * Sign the account out because its credential can no longer be used.
   *
   * Must call `retire` synchronously before its first `await`. Returns the
   * removed account, or null if it was no longer installed.
   */
  readonly requireSignIn: (account: Account) => Promise<Account | null>

  /** A renewed access token for the account was saved and installed. */
  readonly onTokenRenewed: (account: Account, accessToken: string) => void

  /**
   * A sign-in was saved and installed, replacing any session for the same
   * account (endpoint and login).
   *
   * Called synchronously with the swap, so the owner's account list never
   * disagrees with the installed session.
   */
  readonly onSignedIn: (account: Account) => void
}

/**
 * Credential lifecycle for signed-in accounts: one session per account.
 *
 * Multiple accounts can be signed in to the same endpoint. Sessions are keyed
 * by `getAccountKey` (endpoint and login), which also matches how credentials
 * are stored in secure storage.
 *
 * Owns token renewal, lookup of stale token copies, rejected-token handling,
 * and ordered secure-storage writes. The account list stays with the owner,
 * which is told through `ICredentialSessionsDelegate` when it must change.
 */
export class CredentialSessions {
  /** Signed-in session for each account key: account, credential, renewal state. */
  private readonly sessionsByKey = new Map<string, ICredentialSession>()
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
  /** Per-account queue so secure-storage saves and deletes never interleave. */
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
    this.retireSession(account)
    this.sessionsByKey.set(getAccountKey(account), session)
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
   * Save and install a new credential, replacing any session for the account.
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
    await this.write(account, async () => {
      await this.secureStore.setItem(
        getKeyForAccount(account),
        account.login,
        serializeAccountCredential(credential)
      )
      // Swap inside the write so a renewal of the replaced session queued
      // behind it sees the retirement and cannot overwrite this credential.
      this.retireSession(account)
      this.restore(authenticated, credential)
      if (!this.sessionsByAccount.has(account)) {
        this.inheritSession(authenticated, account)
      }
      this.delegate.onSignedIn(authenticated)
    })
    return authenticated
  }

  /** Stop using the account's session so no caller can obtain its token again. */
  public retire(account: Account): void {
    this.retireSession(account)
  }

  /**
   * Delete the account's stored credential after any pending write.
   *
   * Skipped if a later sign-in with the same login has been installed since:
   * the stored item now holds that sign-in's credential.
   */
  public delete(account: Account): Promise<void> {
    return this.write(account, async () => {
      if (this.sessionsByKey.has(getAccountKey(account))) {
        return
      }
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    })
  }

  private retireSession(account: Account): void {
    const key = getAccountKey(account)
    const previous = this.sessionsByKey.get(key)
    if (previous !== undefined) {
      previous.retired = true
      previous.credential = null
      this.notifyLeaseWaiters(previous)
    }
    this.sessionsByKey.delete(key)
  }

  /** The current session for the account, if it's still the same account. */
  private getSession(account: Account): ICredentialSession | undefined {
    const session = this.sessionsByKey.get(getAccountKey(account))
    return session?.account.id === account.id ? session : undefined
  }

  private getSessionsForEndpoint(endpoint: string) {
    return [...this.sessionsByKey.values()].filter(
      s => s.account.endpoint === endpoint
    )
  }

  /** Resolve token snapshots held by long-lived clients without changing identity. */
  public async resolveToken(endpoint: string, token: string): Promise<string> {
    if (token === '') {
      // Accounts restored without a stored credential have an empty token.
      // We can't tell which of them a client belongs to, but none of them can
      // authenticate, so require all of them to sign in again.
      const missing = this.getSessionsForEndpoint(endpoint).filter(
        s => s.credential === null
      )
      if (missing.length > 0) {
        await Promise.all(missing.map(s => this.requireSignIn(s)))
        throw new AccountRequiresSignInError()
      }
    }
    const session = this.sessionsByToken.get(this.tokenKey(endpoint, token))
    return session === undefined ? token : this.validToken(session)
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
    const session = this.getSession(account)
    if (session === undefined) {
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
      const session = this.getSession(account)
      if (session === undefined) {
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
   * Follow the account's current session across renewals.
   *
   * The returned function yields that session's access token, or null once it
   * is retired, so a slow caller never adopts a later sign-in's token.
   */
  public trackToken(account: Account): () => string | null {
    const session = this.getSession(account)
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

  /** Read local expiry metadata without refreshing or exposing either token. */
  public getTokenExpirationForTesting(
    account: Account
  ): IAccountTokenExpiration {
    const session = this.getSessionForTesting(account)
    return {
      isRefreshable: session.credential?.refreshToken !== undefined,
      expiresAt: session.credential?.expiresAt,
      originalExpiresAt:
        session.expirationOverride === undefined
          ? session.credential?.expiresAt
          : session.expirationOverride.originalExpiresAt,
      isOverridden: session.expirationOverride !== undefined,
    }
  }

  /**
   * Override local access-token expiry until renewal or session retirement.
   *
   * Passing undefined restores the original expiry. Never writes secure storage.
   */
  public setTokenExpirationForTesting(
    account: Account,
    expiresAt: number | undefined
  ): IAccountTokenExpiration {
    const session = this.getSessionForTesting(account)
    const credential = session.credential
    if (credential === null || credential.refreshToken === undefined) {
      throw new Error('This account does not have a refreshable token.')
    }
    if (session.refreshing !== undefined) {
      throw new Error(
        'Token renewal is in progress. Try again when it finishes.'
      )
    }
    if (
      expiresAt !== undefined &&
      (!Number.isSafeInteger(expiresAt) ||
        expiresAt < 0 ||
        !Number.isFinite(new Date(expiresAt).getTime()))
    ) {
      throw new Error('Choose a valid token expiration date and time.')
    }

    if (expiresAt === undefined) {
      if (session.expirationOverride !== undefined) {
        session.credential = {
          ...credential,
          expiresAt: session.expirationOverride.originalExpiresAt,
        }
        session.expirationOverride = undefined
      }
    } else {
      session.expirationOverride ??= { originalExpiresAt: credential.expiresAt }
      session.credential = { ...credential, expiresAt }
    }
    this.notifyLeaseWaiters(session)
    log.info('Test access-token expiration override updated.')
    return this.getTokenExpirationForTesting(account)
  }

  private getSessionForTesting(account: Account): ICredentialSession {
    if (!enableTestMenuItems()) {
      throw new Error(
        'Token expiration controls are only available when the test menu is enabled.'
      )
    }
    const session = this.sessionsByAccount.get(account)
    if (
      session === undefined ||
      session.retired ||
      !accountEquals(session.account, account)
    ) {
      throw new AccountRequiresSignInError()
    }
    return session
  }

  /** Ignore obsolete 401s; sign out when the current token is rejected. */
  public async invalidateToken(endpoint: string, token: string): Promise<void> {
    const session = this.sessionsByToken.get(this.tokenKey(endpoint, token))
    if (
      session === undefined ||
      session.retired ||
      session.credential?.accessToken !== token
    ) {
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
    account: Account,
    action: () => Promise<void>
  ): Promise<void> {
    const key = getAccountKey(account)
    const previous = this.credentialWriteQueues.get(key)
    const next = (previous ?? Promise.resolve()).then(action)
    // The caller receives the error; the queue must remain usable for sign-out.
    const settled = next.catch(() => {})
    this.credentialWriteQueues.set(key, settled)
    try {
      await next
    } finally {
      if (this.credentialWriteQueues.get(key) === settled) {
        this.credentialWriteQueues.delete(key)
      }
    }
  }

  private requireSignIn(session: ICredentialSession): Promise<Account | null> {
    if (this.sessionsByKey.get(getAccountKey(session.account)) !== session) {
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
    const reportEvents = session.expirationOverride === undefined
    const notifyRefreshEvent = (event: TokenRefreshEvent) => {
      if (reportEvents) {
        this.delegate.onTokenRefreshEvent?.(event)
      }
    }
    const requireSignInAfterRefreshFailure = async () => {
      const wasRetired = session.retired
      const signOut = this.requireSignIn(session)
      // The delegate retires the session synchronously, before deleting storage.
      if (!wasRetired && session.retired) {
        notifyRefreshEvent('required-sign-in')
      }
      await signOut
    }
    notifyRefreshEvent('attempt')
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
          notifyRefreshEvent('non-transient-failure')
          await requireSignInAfterRefreshFailure()
        } else {
          notifyRefreshEvent('transient-failure')
          log.warn(
            'OAuth renewal failed; retaining credentials for a later retry.'
          )
          throw new Error(
            'Unable to renew your GitHub session. Check your connection and try again shortly.'
          )
        }
      } else {
        notifyRefreshEvent('abandoned')
      }
      throw e
    }

    if (session.retired) {
      notifyRefreshEvent('abandoned')
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new AccountRequiresSignInError()
    }
    try {
      await this.write(account, async () => {
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
        await requireSignInAfterRefreshFailure()
      } else {
        notifyRefreshEvent('abandoned')
      }
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new Error(
        'Unable to save renewed GitHub credentials. Please sign in again.'
      )
    }
    if (session.retired) {
      notifyRefreshEvent('abandoned')
      void this.revokeUnusedToken(account.withToken(renewed.accessToken))
      throw new AccountRequiresSignInError()
    }
    session.credential = renewed
    session.expirationOverride = undefined
    this.sessionsByToken.set(
      this.tokenKey(account.endpoint, renewed.accessToken),
      session
    )
    this.delegate.onTokenRenewed(account, renewed.accessToken)
    notifyRefreshEvent('success')
    log.info('OAuth credentials renewed and saved.')
    return renewed.accessToken
  }
}
