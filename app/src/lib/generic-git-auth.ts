import { getKeyForEndpoint } from './auth'
import { TokenStore } from './stores/token-store'

export const genericGitAuthUsernameKeyPrefix = 'genericGitAuth/username/'

function getKeyForUsername(endpoint: string): string {
  return `${genericGitAuthUsernameKeyPrefix}${endpoint}`
}

/** Get the username for the host. */
export function getGenericUsername(endpoint: string): string | null {
  const key = getKeyForUsername(endpoint)
  return localStorage.getItem(key)
}

/** Set the username for the host. */
export function setGenericUsername(endpoint: string, username: string) {
  const key = getKeyForUsername(endpoint)
  return localStorage.setItem(key, username)
}

/** Set the password for the username and host. */
export function setGenericPassword(
  endpoint: string,
  username: string,
  password: string
): Promise<void> {
  const key = getKeyForEndpoint(endpoint)
  return TokenStore.setItem(key, username, password)
}

export function setGenericCredential(
  endpoint: string,
  username: string,
  password: string
) {
  setGenericUsername(endpoint, username)
  return setGenericPassword(endpoint, username, password)
}

/** Get the password for the given username and host. */
export const getGenericPassword = (endpoint: string, username: string) =>
  TokenStore.getItem(getKeyForEndpoint(endpoint), username)

/** Delete a generic credential */
export function deleteGenericCredential(endpoint: string, username: string) {
  localStorage.removeItem(getKeyForUsername(endpoint))
  return TokenStore.deleteItem(getKeyForEndpoint(endpoint), username)
}
