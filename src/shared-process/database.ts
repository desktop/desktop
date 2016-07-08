import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 1

interface IDatabaseOwner {
  id?: number
  login: string
  endpoint: string
}

interface IDatabaseGitHubRepository {
  id?: number
  ownerID: number
  name: string
  private?: boolean
  fork?: boolean
  htmlURL?: string
}

interface IDatabaseRepository {
  id?: number
  gitHubRepositoryID?: number
  path: string
}

/** The app database. */
export default class Database extends Dexie {
  /** The local repositories table. */
  public repositories: Dexie.Table<IDatabaseRepository, number>

  /** The GitHub repositories table. */
  public gitHubRepositories: Dexie.Table<IDatabaseGitHubRepository, number>

  /** The GitHub repository owners table. */
  public owners: Dexie.Table<IDatabaseOwner, number>

  public constructor(name: string) {
    super(name)

    this.version(DatabaseVersion).stores({
      repositories: '++id, &path',
      gitHubRepositories: '++id, name',
      owners: '++id, login'
    })
  }
}
