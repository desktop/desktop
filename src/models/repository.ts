import * as path from 'path'

import GitHubRepository, {IGitHubRepository} from './github-repository'

/** The data-only interface for Repository for transport across IPC. */
export interface IRepository {
  path: string
  gitHubRepository: IGitHubRepository
}

/**
 * A local repository.
 */
export default class Repository {
  private path: string
  private gitHubRepository: GitHubRepository

  public static fromJSON(json: IRepository): Repository {
    const gitHubRepository = json.gitHubRepository
    if (gitHubRepository) {
       return new Repository(json.path, GitHubRepository.fromJSON(json.gitHubRepository))
    } else {
      return new Repository(json.path, null)
    }
  }

  public constructor(path: string, gitHubRepository: GitHubRepository) {
    this.path = path
    this.gitHubRepository = gitHubRepository
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
}
