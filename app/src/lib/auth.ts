import { Account } from '../models/account'

/** Get the auth key for the user, unique per account login on the endpoint. */
export function getKeyForAccount(account: Account): string {
  const appName = 'GITmaxed'

  return `${appName} - ${account.endpoint}/${account.login}`
}

/**
 * Get the legacy auth key for an endpoint (single-account per endpoint).
 *
 * Used only during migration of pre-multi-account tokens.
 */
export function getLegacyKeyForEndpoint(endpoint: string): string {
  const appName = 'GITmaxed'

  return `${appName} - ${endpoint}`
}
