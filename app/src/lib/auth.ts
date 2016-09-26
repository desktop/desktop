import { User } from '../models/user'

/** Get the auth key for the user. */
export function getKeyForUser(user: User): string {
  return getKeyForEndpoint(user.endpoint)
}

/** Get the auth key for the endpoint. */
export function getKeyForEndpoint(endpoint: string): string {
  return `GitHub - ${endpoint}`
}
