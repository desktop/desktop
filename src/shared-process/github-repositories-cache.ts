import Database from './database'
import GitHubRepository from '../models/github-repository'
import Owner from '../models/owner'

/** The cache for the GitHub repositories the user has access to. */
export default class GitHubRepositoriesCache {
  private db: Database

  public constructor(db: Database) {
    this.db = db
  }

  /** Add the GitHub repository if it isn't already in the cache. */
  public async addRepository(repo: GitHubRepository): Promise<void> {
    const db = this.db
    const transaction = this.db.transaction('rw', this.db.gitHubRepositories, this.db.owners, function*() {
      const match = yield db.gitHubRepositories
        .where('apiID')
        .equals(repo.getAPIID())
        .limit(1)
        .first()

      if (match) { return null }

      const owner = repo.getOwner()
      const existing = yield db.owners.filter(o => o.login === owner.getLogin() && o.endpoint === owner.getEndpoint())
      let ownerID: number = null
      if (existing) {
        ownerID = existing.id
      } else {
        ownerID = yield db.owners.add({login: owner.getLogin(), endpoint: owner.getEndpoint()})
      }

      yield db.gitHubRepositories.add({
        apiID: repo.getAPIID(),
        ownerID,
        name: repo.getName(),
        cloneURL: repo.getCloneURL(),
        gitURL: repo.getGitURL(),
        sshURL: repo.getSSHURL(),
        htmlURL: repo.getHTMLURL(),
      })
    })

    await transaction
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

    return new GitHubRepository(match.name, owner, match.apiID, match.cloneURL, match.gitURL, match.sshURL, match.htmlURL)
  }

  public async findRepositoryID(apiID: string): Promise<number> {
    const match = await this.db.gitHubRepositories.where('apiID').equals(apiID).limit(1).first()
    if (!match) { return null }

    return match.id
  }
}
