import * as URL from 'url'
import { parseRemote } from './remote-parsing'
import { getKeyForEndpoint } from './auth'
import { TokenStore } from './stores/token-store'

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

function getKeyForUsername(hostname: string): string {
  return `genericGitAuth/username/${hostname}`
}

/** Get the username for the host. */
export function getGenericUsername(hostname: string): string | null {
  const key = getKeyForUsername(hostname)
  return localStorage.getItem(key)
}

/** Set the username for the host. */
export function setGenericUsername(hostname: string, username: string) {
  const key = getKeyForUsername(hostname)
  return localStorage.setItem(key, username)
}

/** Set the password for the username and host. */
export function setGenericPassword(
  hostname: string,
  username: string,
  password: string
): Promise<void> {
  const key = getKeyForEndpoint(hostname)
  return TokenStore.setItem(key, username, password)
}
