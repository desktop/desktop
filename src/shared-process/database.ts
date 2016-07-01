import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 1

interface DatabaseOwner {
  id?: number
  login: string
  endpoint: string
}

interface DatabaseGitHubRepository {
  id?: number
  ownerID: number
  name: string,
  cloneURL: string,
  gitURL: string,
  sshURL: string,
  htmlURL: string,
}

interface DatabaseRepository {
  id?: number
  gitHubRepositoryID?: number
  path: string
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
