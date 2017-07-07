import * as Path from 'path'
import { getDocumentsPath } from './app-proxy'

const localStorageKey = 'last-clone-location'

/** The path to the default directory. */
export function getDefaultDir(): string {
  return (
    localStorage.getItem(localStorageKey) ||
    Path.join(getDocumentsPath(), 'GitHub')
  )
}

export function setDefaultDir(path: string) {
  localStorage.setItem(localStorageKey, path)
}
