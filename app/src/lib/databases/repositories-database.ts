import Dexie from 'dexie'

export interface IDatabaseOwner {
  readonly id?: number | null
  readonly login: string
  readonly endpoint: string
}

export interface IDatabaseGitHubRepository {
  readonly id?: number | null
  readonly ownerID: number
  readonly name: string
  readonly private: boolean | null
  readonly htmlURL: string | null
  readonly defaultBranch: string | null
  readonly cloneURL: string | null
  readonly parentID: number | null
}

export interface IDatabaseRepository {
  readonly id?: number | null
  readonly gitHubRepositoryID: number | null
  readonly path: string
  readonly missing: boolean
}

/** The repositories database. */
export class RepositoriesDatabase extends Dexie {
  /** The local repositories table. */
  public repositories: Dexie.Table<IDatabaseRepository, number>

  /** The GitHub repositories table. */
  public gitHubRepositories: Dexie.Table<IDatabaseGitHubRepository, number>

  /** The GitHub repository owners table. */
  public owners: Dexie.Table<IDatabaseOwner, number>

  public constructor(name: string, requestedVersion?: number) {
    super(name)

    this.conditionalVersion(requestedVersion, 1, {
      repositories: '++id, &path',
      gitHubRepositories: '++id, name',
      owners: '++id, login',
    })

    this.conditionalVersion(requestedVersion, 2, {
      owners: '++id, &[endpoint+login]',
    })

    this.conditionalVersion(requestedVersion, 3, {}, t => {
      // We're adding a new index with a uniqueness constraint in the next
      // version and its upgrade callback only happens *after* the schema's been
      // changed. So we need to prepare for it by removing any old data now
      // which will violate it.
      const table = t.table<IDatabaseGitHubRepository, number>(
        'gitHubRepositories'
      )

      const seenKeys = new Set<string>()
      return table.toCollection().each(repo => {
        const key = `${repo.ownerID}+${repo.name}`
        if (seenKeys.has(key)) {
          table.delete(repo.id!)
        } else {
          seenKeys.add(key)
        }
      })
    })

    this.conditionalVersion(requestedVersion, 4, {
      gitHubRepositories: '++id, name, &[ownerID+name]',
    })

    this.version(4).stores({
      gitHubRepositories: '++id, name, &[ownerID+name], cloneURL',
    })
  }

  private conditionalVersion(
    requestedVersion: number | undefined,
    version: number,
    schema: { [key: string]: string | null },
    upgrade?: (t: Dexie.Transaction) => void
  ) {
    if (requestedVersion && requestedVersion < version) {
      return
    }

    const dexieVersion = this.version(version).stores(schema)
    if (upgrade) {
      dexieVersion.upgrade(upgrade)
    }
  }
}
