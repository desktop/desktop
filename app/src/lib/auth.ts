import { Account } from '../models/account'

/**
 * Get the authentication key for storing/retrieving a user's OAuth token.
 *
 * This key uniquely identifies an account in the system keychain. For
 * multi-account support, we include both the endpoint AND the login
 * to ensure each account has its own token storage location.
 *
 * @param account The account to generate a key for
 * @returns A unique string key for the account's token storage
 */
export function getKeyForAccount(account: Account): string {
  // Use endpoint + login to create unique keys per account
  // This allows multiple accounts on the same endpoint (e.g., multiple GitHub.com accounts)
  return getKeyForEndpointAndLogin(account.endpoint, account.login)
}

/**
 * Get the auth key for an endpoint only.
 *
 * @deprecated This function is kept for backward compatibility during migration.
 * New code should use getKeyForEndpointAndLogin() for unique per-account keys.
 *
 * @param endpoint The API endpoint URL
 * @returns A key string containing the endpoint
 */
export function getKeyForEndpoint(endpoint: string): string {
  const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub'

  return `${appName} - ${endpoint}`
}

/**
 * Get the auth key for a specific account (endpoint + login combination).
 *
 * This function generates a unique key for each account by combining
 * the endpoint and login. This is essential for multi-account support
 * where users may have multiple accounts on the same endpoint
 * (e.g., personal and work accounts on GitHub.com).
 *
 * The key format is: "AppName - endpoint/login"
 *
 * Security considerations:
 * - The login is included to ensure token isolation between accounts
 * - Tokens are never included in the key itself
 * - Keys are safe for use in system keychain identifiers
 *
 * @param endpoint The API endpoint URL (e.g., https://api.github.com)
 * @param login The user's login/username
 * @returns A unique key string for the account's token storage
 */
export function getKeyForEndpointAndLogin(
  endpoint: string,
  login: string
): string {
  const appName = __DEV__ ? 'GitHub Desktop Dev' : 'GitHub'

  // Format: "GitHub Desktop Dev - https://api.github.com/username"
  // The slash separates endpoint from login, making it easy to parse if needed
  return `${appName} - ${endpoint}/${login}`
}

