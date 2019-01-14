import { RepositoriesDatabase } from '../../databases/repositories-database'
import { Owner } from '../../../models/owner'
import { GitHubRepository } from '../../../models/github-repository'
import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { BaseStore } from '../base-store'

/** The store for local repositories. */
export class RepositoriesStore extends BaseStore {
  public constructor(db: RepositoriesDatabase) {
    super()
  }

  /** Find the matching GitHub repository or add it if it doesn't exist. */
  public async upsertGitHubRepository(
    endpoint: string,
    apiRepository: IAPIRepository
  ): Promise<GitHubRepository> {
    const ghRepo = new GitHubRepository(
      'mock repo',
      new Owner('fake login', 'fake endpoint', null),
      null,
      false
    )
    this.emitUpdate()
    return Promise.resolve(ghRepo)
  }

  /** Find a GitHub repository by its DB ID. */
  public async findGitHubRepositoryByID(
    id: number
  ): Promise<GitHubRepository | null> {
    const ghRepo = new GitHubRepository(
      'mock repo',
      new Owner('fake login', 'fake endpoint', null),
      null,
      false
    )
    return Promise.resolve(ghRepo)
  }

  /** Get all the local repositories. */
  public getAll(): Promise<ReadonlyArray<Repository>> {
    const repos = new Array<Repository>()
    return Promise.resolve(repos)
  }

  /**
   * Add a new local repository.
   *
   * If a repository already exists with that path, it will be returned instead.
   */
  public async addRepository(path: string): Promise<Repository> {
    const repository = new Repository(path, -1, null, false)

    this.emitUpdate()

    return repository
  }

  /** Remove the repository with the given ID. */
  public async removeRepository(repoID: number): Promise<void> {
    this.emitUpdate()
    return Promise.resolve()
  }

  /** Update the repository's `missing` flag. */
  public async updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    let updatedRepo = new Repository(
      repository.path,
      repository.id,
      repository.gitHubRepository,
      missing
    )
    this.emitUpdate()
    return Promise.resolve(updatedRepo)
  }

  /** Update the repository's path. */
  public async updateRepositoryPath(
    repository: Repository,
    path: string
  ): Promise<Repository> {
    let updatedRepo = new Repository(
      path,
      repository.id,
      repository.gitHubRepository,
      repository.missing
    )
    this.emitUpdate()
    return Promise.resolve(updatedRepo)
  }

  /** Add or update the repository's GitHub repository. */
  public async updateGitHubRepository(
    repository: Repository,
    endpoint: string,
    gitHubRepository: IAPIRepository
  ): Promise<Repository> {
    let updatedRepo = new Repository(
      repository.path,
      repository.id,
      repository.gitHubRepository,
      repository.missing
    )

    this.emitUpdate()

    return Promise.resolve(updatedRepo)
  }

  public async updateLastPruneDate(repository: Repository): Promise<void> {
    this.emitUpdate()
    return Promise.resolve()
  }

  public async getLastPruneDate(
    repository: Repository
  ): Promise<number | null> {
    // Mon Dec 31 2018 00:25:00 GMT-0600 (Central Standard Time)
    const fixedDate = new Date('Mon, 31 Dec 2018 06:00:00 GMT')
    return Promise.resolve(fixedDate.getTime())
  }
}
