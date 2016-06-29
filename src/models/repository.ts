import GitHubRepository from './github-repository'

/**
 * A local repository.
 */
export default class Repository {
  public path: string
  public gitHubRepository: GitHubRepository

  public static fromJSON(json: any): Repository {
    return new Repository(json.path, GitHubRepository.fromJSON(json.gitHubRepository))
  }

  public constructor(path: string, gitHubRepository: GitHubRepository) {
    this.path = path
    this.gitHubRepository = gitHubRepository
  }
}
