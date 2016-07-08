import * as path from 'path'

import GitHubRepository, {IGitHubRepository} from './github-repository'

/** The data-only interface for Repository for transport across IPC. */
export interface IRepository {
  id?: number
  path: string
  gitHubRepository: IGitHubRepository
}

/**
 * A local repository.
 */
export default class Repository {
  private id: number
  private path: string
  private gitHubRepository: GitHubRepository

  /** Create a new Repository from a data-only representation. */
  public static fromJSON(json: IRepository): Repository {
    const gitHubRepository = json.gitHubRepository
    if (gitHubRepository) {
       return new Repository(json.path, GitHubRepository.fromJSON(gitHubRepository), json.id)
    } else {
      return new Repository(json.path, null, json.id)
    }
  }

  public constructor(path: string, gitHubRepository: GitHubRepository, id?: number) {
    this.path = path
    this.gitHubRepository = gitHubRepository
    this.id = id
  }

  /** Create a new repository the same as the receiver but with the given ID. */
  public withID(id: number): Repository {
    return new Repository(this.path, this.gitHubRepository, id)
  }

  /**
   * Create a new repository the same as the receiver but with the given GitHub
   * repository.
   */
  public withGitHubRepository(gitHubRepository: GitHubRepository): Repository {
    return new Repository(this.path, gitHubRepository, this.id)
  }

  public getGitHubRepository(): GitHubRepository {
    return this.gitHubRepository
  }

  public getPath(): string {
    return this.path
  }

  public getName(): string {
    return path.basename(this.path)
  }

  public getID(): number {
    return this.id
  }
}
