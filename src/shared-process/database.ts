import Dexie from 'dexie'

const DatabaseVersion = 1

interface DatabaseOwner {
  id?: number
  login: string
  endpoint: string
}

interface DatabaseGitHubRepository {
  id?: number
  ownerID: number
  name: string
}

interface DatabaseRepository {
  id?: number
  gitHubRepositoryID?: number
  path: string
}

export default class Database extends Dexie {
  public repositories: Dexie.Table<DatabaseRepository, number>
  public gitHubRepositories: Dexie.Table<DatabaseGitHubRepository, number>
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
