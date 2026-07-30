// Created by Pablo Urena Simon.

import * as Path from 'path'

import { Repository } from '../models/repository'
import { getObject, setObject } from './local-storage'

const RepositoryFoldersStorageKey = 'repository-folders-v1'

export interface IRepositoryFoldersState {
  readonly folders: ReadonlyArray<string>
  readonly assignments: Readonly<Record<string, string>>
  readonly collapsedFolders: ReadonlyArray<string>
}

export const EmptyRepositoryFoldersState: IRepositoryFoldersState = {
  folders: [],
  assignments: {},
  collapsedFolders: [],
}

const getRepositoryKey = (repository: Repository) => {
  const path = Path.resolve(repository.path)
  return __WIN32__ ? path.toLowerCase() : path
}

const getCanonicalFolderName = (
  folders: ReadonlyArray<string>,
  name: string
) => {
  const normalizedName = name.trim().toLowerCase()
  return folders.find(folder => folder.toLowerCase() === normalizedName) ?? null
}

export function loadRepositoryFolders(): IRepositoryFoldersState {
  const stored = getObject<Partial<IRepositoryFoldersState>>(
    RepositoryFoldersStorageKey
  )

  if (
    stored === undefined ||
    !Array.isArray(stored.folders) ||
    stored.folders.some(folder => typeof folder !== 'string')
  ) {
    return EmptyRepositoryFoldersState
  }

  const folders = stored.folders
    .map(folder => folder.trim())
    .filter(
      (folder, index, values) =>
        folder.length > 0 &&
        values.findIndex(
          value => value.toLowerCase() === folder.toLowerCase()
        ) === index
    )
  const assignments =
    stored.assignments !== null &&
    typeof stored.assignments === 'object' &&
    !Array.isArray(stored.assignments)
      ? Object.fromEntries(
          Object.entries(stored.assignments).flatMap(
            ([repositoryKey, folder]) => {
              if (typeof folder !== 'string') {
                return []
              }

              const canonicalName = getCanonicalFolderName(folders, folder)
              return canonicalName === null
                ? []
                : [[repositoryKey, canonicalName]]
            }
          )
        )
      : {}
  const collapsedFolders = Array.isArray(stored.collapsedFolders)
    ? stored.collapsedFolders
        .filter(folder => typeof folder === 'string')
        .flatMap(folder => {
          const canonicalName = getCanonicalFolderName(folders, folder)
          return canonicalName === null ? [] : [canonicalName]
        })
        .filter((folder, index, values) => values.indexOf(folder) === index)
    : []

  return { folders, assignments, collapsedFolders }
}

export function saveRepositoryFolders(state: IRepositoryFoldersState) {
  setObject(RepositoryFoldersStorageKey, state)
}

export function getRepositoryFolder(
  state: IRepositoryFoldersState,
  repository: Repository
): string | null {
  return state.assignments[getRepositoryKey(repository)] ?? null
}

export function createRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const folderName = name.trim()

  if (
    folderName.length === 0 ||
    getCanonicalFolderName(state.folders, folderName) !== null
  ) {
    return state
  }

  return { ...state, folders: [...state.folders, folderName] }
}

export function assignRepositoryFolder(
  state: IRepositoryFoldersState,
  repository: Repository,
  folder: string | null
): IRepositoryFoldersState {
  const assignments = { ...state.assignments }
  const repositoryKey = getRepositoryKey(repository)

  if (folder === null) {
    delete assignments[repositoryKey]
  } else {
    const canonicalName = getCanonicalFolderName(state.folders, folder)
    if (canonicalName === null) {
      return state
    }
    assignments[repositoryKey] = canonicalName
  }

  return { ...state, assignments }
}

export function renameRepositoryFolder(
  state: IRepositoryFoldersState,
  currentName: string,
  newName: string
): IRepositoryFoldersState {
  const canonicalCurrentName = getCanonicalFolderName(
    state.folders,
    currentName
  )
  const folderName = newName.trim()
  const existingName = getCanonicalFolderName(state.folders, folderName)

  if (
    canonicalCurrentName === null ||
    folderName.length === 0 ||
    (existingName !== null && existingName !== canonicalCurrentName)
  ) {
    return state
  }

  const assignments = Object.fromEntries(
    Object.entries(state.assignments).map(([repositoryKey, folder]) => [
      repositoryKey,
      folder === canonicalCurrentName ? folderName : folder,
    ])
  )

  return {
    folders: state.folders.map(folder =>
      folder === canonicalCurrentName ? folderName : folder
    ),
    assignments,
    collapsedFolders: state.collapsedFolders.map(folder =>
      folder === canonicalCurrentName ? folderName : folder
    ),
  }
}

export function deleteRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const canonicalName = getCanonicalFolderName(state.folders, name)

  if (canonicalName === null) {
    return state
  }

  return {
    folders: state.folders.filter(folder => folder !== canonicalName),
    assignments: Object.fromEntries(
      Object.entries(state.assignments).filter(
        ([, folder]) => folder !== canonicalName
      )
    ),
    collapsedFolders: state.collapsedFolders.filter(
      folder => folder !== canonicalName
    ),
  }
}

export function toggleRepositoryFolder(
  state: IRepositoryFoldersState,
  name: string
): IRepositoryFoldersState {
  const canonicalName = getCanonicalFolderName(state.folders, name)

  if (canonicalName === null) {
    return state
  }

  return {
    ...state,
    collapsedFolders: state.collapsedFolders.includes(canonicalName)
      ? state.collapsedFolders.filter(folder => folder !== canonicalName)
      : [...state.collapsedFolders, canonicalName],
  }
}
