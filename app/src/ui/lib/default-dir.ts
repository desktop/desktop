import * as OS from 'os'

const localStorageKey = 'last-clone-location'

/** The path to the default directory. */
export function getDefaultDir(): string {
  return localStorage.getItem(localStorageKey) || OS.homedir()
}

export function setDefaultDir(path: string) {
  localStorage.setItem(localStorageKey, path)
}
