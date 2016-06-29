import Dexie from 'dexie'

const DatabaseVersion = 1

interface DatabaseOwner {
  login: string
}

interface DatabaseGitHubRepository {
  ownerID: number
  name: string
}

interface DatabaseRepository {
  gitHubRepositoryID?: number
  path: string
}

export default class Database extends Dexie {
  public repositories: Dexie.Table<DatabaseRepository, number>
  public gitHubRepositories: Dexie.Table<DatabaseGitHubRepository, number>
  public owners: Dexie.Table<DatabaseOwner, number>

  public constructor() {
    super('Database')

    this.version(DatabaseVersion).stores({
      repositories: '++id, &path',
      gitHubRepositories: '++id, name, owner.login, [owner.login+name]',
      owners: '++id, login'
    })
  }
}
