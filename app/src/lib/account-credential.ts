import { IOAuthToken } from './oauth-token'

const prefix = 'github-desktop-oauth:'

/** A null credential records that this account must sign in again. */
export type AccountCredential = IOAuthToken | null

/** Store the entire rotating pair in one secure-store item. */
export function serializeAccountCredential(
  credential: AccountCredential
): string {
  return credential !== null && credential.refreshToken === undefined
    ? credential.accessToken
    : prefix + JSON.stringify({ version: 1, credential })
}

/** Read legacy tokens and versioned credentials without exposing malformed data. */
export function deserializeAccountCredential(
  value: string | null
): AccountCredential {
  if (!value) {
    return null
  }
  if (!value.startsWith(prefix)) {
    return { accessToken: value }
  }

  try {
    const record: unknown = JSON.parse(value.slice(prefix.length))
    if (
      typeof record === 'object' &&
      record !== null &&
      'version' in record &&
      record.version === 1 &&
      'credential' in record
    ) {
      const credential = record.credential
      if (credential === null) {
        return null
      }
      if (
        typeof credential === 'object' &&
        'accessToken' in credential &&
        typeof credential.accessToken === 'string' &&
        credential.accessToken.length > 0 &&
        'refreshToken' in credential &&
        typeof credential.refreshToken === 'string' &&
        credential.refreshToken.length > 0
      ) {
        const expiresAt =
          'expiresAt' in credential ? credential.expiresAt : undefined
        const refreshTokenExpiresAt =
          'refreshTokenExpiresAt' in credential
            ? credential.refreshTokenExpiresAt
            : undefined
        if (validExpiry(expiresAt) && validExpiry(refreshTokenExpiresAt)) {
          return {
            accessToken: credential.accessToken,
            refreshToken: credential.refreshToken,
            expiresAt,
            refreshTokenExpiresAt,
          }
        }
      }
    }
  } catch {
    // Never include the secure-store contents in an exception.
  }
  throw new Error(
    'Unable to read stored OAuth credentials. Please sign in again.'
  )
}

function validExpiry(value: unknown): value is number | undefined {
  return (
    value === undefined ||
    (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0)
  )
}
