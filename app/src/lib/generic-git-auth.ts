import * as URL from 'url'
import { parseRemote } from './remote-parsing'
import { getKeyForEndpoint } from './auth'
import { TokenStore } from './dispatcher/token-store'

/**
 * Keytar can only store passwords keyed by a username. So we store the actual
 * username under this key.
 */
const UsernameKey = 'username'

/** Get the hostname to use for the given remote. */
export function getGenericHostname(remoteURL: string): string {
  const parsed = parseRemote(remoteURL)
  if (parsed) {
    return parsed.hostname
  }

  const urlHostname = URL.parse(remoteURL).hostname
  if (urlHostname) {
    return urlHostname
  }

  return remoteURL
}

function getKeyForGenericEndpoint(hostname: string): string {
  return getKeyForEndpoint(`${hostname} (generic)`)
}

function getKeyForUsername(hostname: string): string {
  return getKeyForGenericEndpoint(`login@${hostname}`)
}

/** Get the username for the host. */
export function getGenericUsername(hostname: string): Promise<string | null> {
  const key = getKeyForUsername(hostname)
  return TokenStore.getItem(key, UsernameKey)
}

/** Get the password for the host. */
export function getGenericPassword(
  hostname: string,
  username: string
): Promise<string | null> {
  const key = getKeyForGenericEndpoint(hostname)
  return TokenStore.getItem(key, username)
}

export function setGenericUsername(
  hostname: string,
  username: string
): Promise<void> {
  const key = getKeyForUsername(hostname)
  return TokenStore.setItem(key, UsernameKey, username)
}

export function setGenericPassword(
  hostname: string,
  username: string,
  password: string
): Promise<void> {
  const key = getKeyForGenericEndpoint(hostname)
  return TokenStore.setItem(key, username, password)
}
