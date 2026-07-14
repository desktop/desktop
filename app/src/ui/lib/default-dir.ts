import * as Path from 'path'
import { getDocumentsPath } from './app-proxy'

const localStorageKey = 'last-clone-location'

/** The path to the default directory. */
export async function getDefaultDir(): Promise<string> {
  return (
    localStorage.getItem(localStorageKey) ||
    Path.join(await getDocumentsPath(), 'GitHub')
  )
}

export function setDefaultDir(path: string) {
  localStorage.setItem(localStorageKey, path)
}

/**
 * Get the default clone directory for a specific account.
 * Falls back to the global default if no per-account path is stored.
 */
export async function getDefaultDirForAccount(
  accountLogin: string
): Promise<string> {
  const key = `last-clone-location-${accountLogin}`
  return (
    localStorage.getItem(key) ||
    Path.join(await getDocumentsPath(), 'GitHub', accountLogin)
  )
}

/**
 * Save the default clone directory for a specific account.
 */
export function setDefaultDirForAccount(accountLogin: string, path: string) {
  localStorage.setItem(`last-clone-location-${accountLogin}`, path)
}
