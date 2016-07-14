import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 1

export interface DatabaseOwner {
  readonly id?: number | null
  readonly login: string
  readonly endpoint: string
}

export interface DatabaseGitHubRepository {
  readonly id?: number | null
  readonly ownerID: number
  readonly name: string
  readonly private: boolean | null
  readonly fork: boolean | null
  readonly htmlURL: string | null
}

export interface DatabaseRepository {
  readonly id?: number | null
  readonly gitHubRepositoryID: number | null
  readonly path: string
}

/** The app database. */
export default class Database extends Dexie {
  /** The local repositories table. */
  public repositories: Dexie.Table<DatabaseRepository, number>

  /** The GitHub repositories table. */
  public gitHubRepositories: Dexie.Table<DatabaseGitHubRepository, number>

  /** The GitHub repository owners table. */
  public owners: Dexie.Table<DatabaseOwner, number>

  public constructor(name: string) {
    super(name)

    this.version(DatabaseVersion).stores({
      repositories: '++id, &path',
      gitHubRepositories: '++id, name',
      owners: '++id, login'
    })
  }
}
