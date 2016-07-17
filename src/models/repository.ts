import * as path from 'path'

import GitHubRepository, {IGitHubRepository} from './github-repository'

/** The data-only interface for Repository for transport across IPC. */
export interface IRepository {
  readonly id: number | null
  readonly path: string
  readonly gitHubRepository: IGitHubRepository | null
}

/** A local repository. */
export default class Repository implements IRepository {
  public readonly id: number | null
  public readonly path: string
  public readonly gitHubRepository: GitHubRepository | null

  /** Create a new Repository from a data-only representation. */
  public static fromJSON(json: IRepository): Repository {
    const gitHubRepository = json.gitHubRepository
    if (gitHubRepository) {
       return new Repository(json.path, GitHubRepository.fromJSON(gitHubRepository), json.id)
    } else {
      return new Repository(json.path, null, json.id)
    }
  }

  public constructor(path: string, gitHubRepository: GitHubRepository | null = null, id: number | null = null) {
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

  public get name(): string {
    return path.basename(this.path)
  }
}
