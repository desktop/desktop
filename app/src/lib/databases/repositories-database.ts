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

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      repositories: '++id, &path',
      gitHubRepositories: '++id, name',
      owners: '++id, login',
    })

    this.version(2).stores({
      owners: '++id, &[endpoint+login]',
    })

    this.version(3).stores({
      gitHubRepositories: '++id, name, &[ownerID+name]',
    })

    this.version(4).stores({
      gitHubRepositories: '++id, name, &[ownerID+name], cloneURL',
    })
  }
}
