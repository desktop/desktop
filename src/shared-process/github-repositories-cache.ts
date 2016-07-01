import Database from './database'
import GitHubRepository from '../models/github-repository'

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
  public findRepositoryWithRemoteURL(remoteURL: string): Promise<GitHubRepository> {
    return Promise.resolve(null)
  }
}
