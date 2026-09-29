import { Account } from '../models/account'

/** Get the auth key for the user. */
export function getKeyForAccount(account: Account): string {
  return getKeyForEndpoint(account.endpoint)
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string): string {
  // Namespaced by the app name so that this build doesn't read, overwrite or
  // delete the credentials of an installed official GitHub Desktop.
  const appName = __DEV__ ? `${__APP_NAME__} Dev` : __APP_NAME__

  return `${appName} - ${endpoint}`
}
