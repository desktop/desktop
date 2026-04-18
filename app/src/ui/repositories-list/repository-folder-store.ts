import { getObject, setObject } from '../../lib/local-storage'

const RepositoryFolderStoreKey = 'repository-folder-store'

export interface IRepositoryFolder {
  readonly id: string
  readonly name: string
}

export interface IRepositoryFolderStore {
  readonly folders: ReadonlyArray<IRepositoryFolder>
  readonly assignments: Readonly<Record<string, string>>
}

const emptyRepositoryFolderStore: IRepositoryFolderStore = {
  folders: [],
  assignments: {},
}

export function loadRepositoryFolderStore(): IRepositoryFolderStore {
  const store = getObject<IRepositoryFolderStore>(RepositoryFolderStoreKey)

  return isRepositoryFolderStore(store) ? store : emptyRepositoryFolderStore
}

export function saveRepositoryFolderStore(store: IRepositoryFolderStore) {
  setObject(RepositoryFolderStoreKey, store)
}

export function createRepositoryFolder(
  store: IRepositoryFolderStore,
  name: string
): {
  readonly store: IRepositoryFolderStore
  readonly folder: IRepositoryFolder
} {
  const normalizedName = normalizeFolderName(name)
  const folder: IRepositoryFolder = {
    id: createRepositoryFolderId(),
    name: normalizedName,
  }

  return {
    folder,
    store: {
      ...store,
      folders: [...store.folders, folder],
    },
  }
}

export function replaceRepositoryFolders(
  store: IRepositoryFolderStore,
  folders: ReadonlyArray<IRepositoryFolder>
): IRepositoryFolderStore {
  const nextFolders = folders.map(folder => ({
    id: folder.id,
    name: normalizeFolderName(folder.name),
  }))
  const folderIds = new Set(nextFolders.map(folder => folder.id))
  const assignments: Record<string, string> = {}

  for (const [repositoryId, folderId] of Object.entries(store.assignments)) {
    if (folderIds.has(folderId)) {
      assignments[repositoryId] = folderId
    }
  }

  return {
    folders: nextFolders,
    assignments,
  }
}

export function assignRepositoryToFolder(
  store: IRepositoryFolderStore,
  repositoryId: number,
  folderId: string | null
): IRepositoryFolderStore {
  const assignments = { ...store.assignments }
  const assignmentKey = repositoryId.toString()

  if (folderId === null) {
    delete assignments[assignmentKey]
  } else {
    assignments[assignmentKey] = folderId
  }

  return {
    ...store,
    assignments,
  }
}

export function getRepositoryFolderId(
  store: IRepositoryFolderStore,
  repositoryId: number
): string | null {
  return store.assignments[repositoryId.toString()] ?? null
}

export function hasFolderName(
  store: IRepositoryFolderStore,
  name: string,
  currentFolderId?: string
): boolean {
  const normalizedName = normalizeFolderName(name).toLowerCase()

  return store.folders.some(
    folder =>
      folder.id !== currentFolderId &&
      folder.name.toLowerCase() === normalizedName
  )
}

export function normalizeFolderName(name: string): string {
  return name.trim()
}

function createRepositoryFolderId(): string {
  return `folder-${crypto.randomUUID()}`
}

function isRepositoryFolderStore(
  store: IRepositoryFolderStore | undefined
): store is IRepositoryFolderStore {
  if (store === undefined) {
    return false
  }

  if (
    !(store.folders instanceof Array) ||
    typeof store.assignments !== 'object'
  ) {
    return false
  }

  return store.folders.every(isRepositoryFolder)
}

function isRepositoryFolder(folder: unknown): folder is IRepositoryFolder {
  if (typeof folder !== 'object' || folder === null) {
    return false
  }

  const candidate = folder as { id?: unknown; name?: unknown }
  return typeof candidate.id === 'string' && typeof candidate.name === 'string'
}
