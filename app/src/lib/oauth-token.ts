import { getAbsoluteUrl, getUserAgent } from './http'

const ClientID = process.env.TEST_ENV ? '' : __OAUTH_CLIENT_ID__
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__
const requestTimeout = 30_000

/** OAuth credentials and their optional absolute expiration times. */
export interface IOAuthToken {
  /** The access token used for API requests. */
  readonly accessToken: string
  /** The token used to obtain a replacement access token. */
  readonly refreshToken?: string
  /** Access token expiration time, in milliseconds since the Unix epoch. */
  readonly expiresAt?: number
  /** Refresh token expiration time, in milliseconds since the Unix epoch. */
  readonly refreshTokenExpiresAt?: number
}

/** An OAuth response that cannot safely be used as credentials. */
export class OAuthTokenResponseError extends Error {
  public constructor() {
    super('The OAuth token response is invalid.')
    this.name = 'OAuthTokenResponseError'
  }
}

/** The server explicitly rejected a refresh token. */
export class OAuthRefreshRejectedError extends Error {
  public constructor() {
    super('The OAuth refresh token was rejected.')
    this.name = 'OAuthRefreshRejectedError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isToken(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !/\s/.test(value)
}

function parseExpiration(value: unknown, issuedAt: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new OAuthTokenResponseError()
  }

  const expiresAt = issuedAt + value * 1000
  if (!Number.isSafeInteger(expiresAt)) {
    throw new OAuthTokenResponseError()
  }

  return expiresAt
}

/**
 * Validate an OAuth token response and convert lifetime seconds to absolute
 * milliseconds. Missing lifetimes remain unknown; zero means already expired.
 */
export function parseOAuthToken(value: unknown, issuedAt: number): IOAuthToken {
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt < 0 ||
    !isRecord(value) ||
    'error' in value ||
    !isToken(value.access_token) ||
    ('refresh_token' in value && !isToken(value.refresh_token)) ||
    ('refresh_token_expires_in' in value && !('refresh_token' in value)) ||
    ('token_type' in value &&
      (typeof value.token_type !== 'string' ||
        value.token_type.toLowerCase() !== 'bearer')) ||
    ('scope' in value && typeof value.scope !== 'string')
  ) {
    throw new OAuthTokenResponseError()
  }

  return {
    accessToken: value.access_token,
    ...(isToken(value.refresh_token)
      ? { refreshToken: value.refresh_token }
      : {}),
    ...('expires_in' in value
      ? { expiresAt: parseExpiration(value.expires_in, issuedAt) }
      : {}),
    ...('refresh_token_expires_in' in value
      ? {
          refreshTokenExpiresAt: parseExpiration(
            value.refresh_token_expires_in,
            issuedAt
          ),
        }
      : {}),
  }
}

/**
 * Exchange a browser authorization code for credentials.
 *
 * The endpoint must be the HTML endpoint, not the API endpoint.
 */
export async function exchangeOAuthToken(
  htmlEndpoint: string,
  code: string
): Promise<IOAuthToken> {
  return requestOAuthToken(htmlEndpoint, { code }, false)
}

/**
 * Rotate a refresh token, requiring both replacement credentials.
 *
 * The endpoint must be the HTML endpoint, not the API endpoint. Requests are
 * never replayed because a refresh token may only be usable once.
 */
export async function refreshOAuthToken(
  htmlEndpoint: string,
  refreshToken: string
): Promise<IOAuthToken> {
  return requestOAuthToken(
    htmlEndpoint,
    { grant_type: 'refresh_token', refresh_token: refreshToken },
    true
  )
}

async function requestOAuthToken(
  htmlEndpoint: string,
  parameters: Readonly<Record<string, string>>,
  refreshing: boolean
): Promise<IOAuthToken> {
  const controller = new AbortController()
  const issuedAt = Date.now()
  let timeout: ReturnType<typeof setTimeout> | undefined

  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new Error('The OAuth token request timed out.'))
    }, requestTimeout)
  })

  try {
    const request = async () => {
      const response = await fetch(
        getAbsoluteUrl(htmlEndpoint, 'login/oauth/access_token'),
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': getUserAgent(),
          },
          body: JSON.stringify({
            client_id: ClientID,
            client_secret: ClientSecret,
            ...parameters,
          }),
          signal: controller.signal,
          redirect: 'error',
          cache: 'no-store',
        }
      )

      let value: unknown
      try {
        value = await response.json()
      } catch {
        if (!response.ok) {
          throw new Error('The OAuth token request failed.')
        }
        throw new OAuthTokenResponseError()
      }

      if (response.status >= 500) {
        throw new Error('The OAuth token request failed.')
      }
      if (isRecord(value) && 'error' in value) {
        if (
          refreshing &&
          (value.error === 'bad_refresh_token' ||
            value.error === 'invalid_grant')
        ) {
          throw new OAuthRefreshRejectedError()
        }
        throw new Error('The OAuth token request failed.')
      }

      if (!response.ok) {
        throw new Error('The OAuth token request failed.')
      }

      const token = parseOAuthToken(value, issuedAt)
      if (refreshing && token.refreshToken === undefined) {
        throw new OAuthTokenResponseError()
      }

      return token
    }

    return await Promise.race([request(), deadline])
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('The OAuth token request timed out.')
    }
    if (
      error instanceof OAuthTokenResponseError ||
      error instanceof OAuthRefreshRejectedError
    ) {
      throw error
    }
    // Fetch and JSON errors can contain credentials, URLs, or response bodies.
    throw new Error('The OAuth token request failed.')
  } finally {
    clearTimeout(timeout)
  }
}
