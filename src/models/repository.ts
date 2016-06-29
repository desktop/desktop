import GitHubRepository, {IGitHubRepository} from './github-repository'

/** The data-only interface for Repository. For transport across IPC and storage. */
export interface IRepository {
  path: string
  gitHubRepository: IGitHubRepository
}

/**
 * A local repository.
 */
export default class Repository {
  public path: string
  public gitHubRepository: GitHubRepository

  public static fromJSON(json: IRepository): Repository {
    return new Repository(json.path, GitHubRepository.fromJSON(json.gitHubRepository))
  }

  public constructor(path: string, gitHubRepository: GitHubRepository) {
    this.path = path
    this.gitHubRepository = gitHubRepository
  }
}
