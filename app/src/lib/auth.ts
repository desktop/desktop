import { Account } from '../models/account'

/** Get the auth key for the user. */
export function getKeyForAccount(user: Account): string {
  return getKeyForEndpoint(user.endpoint)
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string): string {
  return `GitHub - ${endpoint}`
}
