import { parseRemote } from './remote-parsing'
import { getKeyForEndpoint } from './auth'
import { TokenStore } from './stores/token-store'

const tryParseURLHostname = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return undefined
  }
}

/** Get the hostname to use for the given remote. */
export function getGenericHostname(remoteURL: string): string {
  const parsed = parseRemote(remoteURL)
  if (parsed) {
    if (parsed.protocol === 'https') {
      return tryParseURLHostname(remoteURL) ?? parsed.hostname
    }

    return parsed.hostname
  }

  return tryParseURLHostname(remoteURL) ?? remoteURL
}

export const genericGitAuthUsernameKeyPrefix = 'genericGitAuth/username/'

function getKeyForUsername(hostname: string): string {
  return `${genericGitAuthUsernameKeyPrefix}${hostname}`
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

/** Delete a generic credential */
export function deleteGenericCredential(hostname: string, username: string) {
  localStorage.removeItem(getKeyForUsername(hostname))
  return TokenStore.deleteItem(getKeyForEndpoint(hostname), username)
}
