import Database from './database'
import GitHubRepository from '../models/github-repository'
import Owner from '../models/owner'

/** The cache for the GitHub repositories the user has access to. */
export default class GitHubRepositoriesCache {
  private db: Database

  public constructor(db: Database) {
    this.db = db
  }

  /** Update or add the GitHub repository. */
  public putRepository(repo: GitHubRepository): Promise<void> {
    return Promise.resolve()
  }

  /** Find the repository with the given remote URL. */
  public async findRepositoryWithRemoteURL(remoteURL: string): Promise<GitHubRepository> {
    const match = await this.db.gitHubRepositories
      .filter(repo => {
        return repo.cloneURL === remoteURL || repo.gitURL === remoteURL || repo.sshURL === remoteURL
      })
      .limit(1)
      .first()

    if (!match) { return null }

    const repoOwner = await this.db.owners.get(match.ownerID)
    const owner = new Owner(repoOwner.login, repoOwner.endpoint)

    return new GitHubRepository(match.name, owner)
  }
}
