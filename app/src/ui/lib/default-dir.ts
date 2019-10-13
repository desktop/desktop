import * as Path from 'path'
import { getDocumentsPath } from './app-proxy'

const localStorageKey = 'last-clone-location'
const localLayoutKey = 'last-clone-location-layout'

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

/** The layout of the default directory. */
export function getDefaultDirLayout(): string {
  return localStorage.getItem(localLayoutKey) || 'unknown'
}

export function setDefaultDirLayout(layout: string) {
  localStorage.setItem(localLayoutKey, layout)
}
