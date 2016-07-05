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
        .where('[apiID+endpoint]')
        .equals([repo.apiID, repo.endpoint])
        .limit(1)
        .first()

      if (match) { return null }

      const owner = repo.owner
      const existing = yield db.owners
        .where('[login+endpoint]')
        .equals([owner.login, owner.endpoint])
        .limit(1)
        .first()

      let ownerID: number = null
      if (existing) {
        ownerID = existing.id
      } else {
        ownerID = yield db.owners.add({login: owner.login, endpoint: owner.endpoint})
      }

      yield db.gitHubRepositories.add({
        apiID: repo.apiID,
        ownerID,
        name: repo.name,
        cloneURL: repo.cloneURL,
        gitURL: repo.gitURL,
        sshURL: repo.sshURL,
        htmlURL: repo.htmlURL,
        endpoint: owner.endpoint,
      })
    })

    await transaction
  }

  /** Find the repository with the given remote URL. */
  public async findRepositoryWithRemoteURL(remoteURL: string): Promise<GitHubRepository> {
    const db = this.db
    let repo: GitHubRepository = null
    const transaction = this.db.transaction('r', this.db.gitHubRepositories, this.db.owners, function*() {
      const match = yield db.gitHubRepositories
        .filter(repo => {
          return repo.cloneURL === remoteURL || repo.gitURL === remoteURL || repo.sshURL === remoteURL
        })
        .limit(1)
        .first()

      if (!match) { return null }

      const repoOwner = yield db.owners.get(match.ownerID)
      const owner = new Owner(repoOwner.login, repoOwner.endpoint)
      repo = new GitHubRepository(match.name, owner, match.apiID, match.cloneURL, match.gitURL, match.sshURL, match.htmlURL, match.id)
    })

    await transaction

    return repo
  }

  public async getRepositories(): Promise<GitHubRepository[]> {
    const db = this.db
    let repos: GitHubRepository[] = []
    const transaction = this.db.transaction('r', this.db.gitHubRepositories, this.db.owners, function*() {
      const all = yield db.gitHubRepositories.toArray()

      for (let repo of all) {
        const repoOwner = yield db.owners.get(repo.ownerID)
        const owner = new Owner(repoOwner.login, repoOwner.endpoint)
        const gitHubRepo = new GitHubRepository(repo.name, owner, repo.apiID, repo.cloneURL, repo.gitURL, repo.sshURL, repo.htmlURL, repo.id)
        repos.push(gitHubRepo)
      }
    })

    await transaction

    return repos
  }

  public async findRepositoryID(apiID: string): Promise<number> {
    const match = await this.db.gitHubRepositories.where('apiID').equals(apiID).limit(1).first()
    if (!match) { return null }

    return match.id
  }
}
