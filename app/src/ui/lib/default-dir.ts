import * as Path from 'path'
import { getDocumentsPath } from './app-proxy'

const localStorageKey = 'last-clone-location'
const localLayoutKey = 'repository-layout'

/** How to layout repositories in the repository directory. */
export enum RepositoryLayout {
  /** Layout repositories by name. */
  Name = 'NAME',
  /** Layout repositories by owner and name. */
  OwnerName = 'OWNER_NAME',
}

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

/** The preferred repository layout. */
export function getRepositoryLayout(): RepositoryLayout {
  return (localStorage.getItem(localLayoutKey) ||
    RepositoryLayout.Name) as RepositoryLayout
}

export function setRepositoryLayout(layout: RepositoryLayout) {
  localStorage.setItem(localLayoutKey, layout)
}
