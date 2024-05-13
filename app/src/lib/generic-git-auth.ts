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

/**
 * Migrate generic git credentials from the old format which could include
 * a path to the new format which only includes the hostname.
 */
export async function removePathFromGenericGitAuthCreds() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(genericGitAuthUsernameKeyPrefix)) {
        const oldHostname = key.substring(
          genericGitAuthUsernameKeyPrefix.length
        )
        const slashIx = oldHostname.indexOf('/')
        if (slashIx === -1) {
          continue
        }

        const newHostname = oldHostname.substring(0, slashIx)
        log.info(`Migrating credentials ${oldHostname} → ${newHostname}`)

        // Don't overwrite existing credentials
        if (getGenericUsername(newHostname)) {
          continue
        }

        const username = getGenericUsername(oldHostname)

        if (!username) {
          continue
        }

        const password = await TokenStore.getItem(
          getKeyForEndpoint(oldHostname),
          username
        )

        if (password) {
          setGenericUsername(newHostname, username)
          setGenericPassword(newHostname, username, password)

          deleteGenericCredential(oldHostname, username)
        }
      }
    }
  } catch {
    log.error('Failed to remove path from generic git credentials')
  }
}
