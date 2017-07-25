import * as URL from 'url'
import { parseRemote } from './remote-parsing'
import { getKeyForEndpoint } from './auth'
import { TokenStore } from './dispatcher/token-store'

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

function getKeyForLogin(hostname: string): string {
  return getKeyForGenericEndpoint(`login@${hostname}`)
}

/** Get the user login for the host. */
export function getGenericLogin(hostname: string): Promise<string | null> {
  const key = getKeyForLogin(hostname)
  console.log(`get login for ${key}`)
  return TokenStore.getItem(key, 'login')
}

/** Get the password for the host. */
export function getGenericPassword(
  hostname: string,
  login: string
): Promise<string | null> {
  const key = getKeyForGenericEndpoint(hostname)
  return TokenStore.getItem(key, login)
}
