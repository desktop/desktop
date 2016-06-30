import Dexie from 'dexie'
import Database from './database'
import Owner from '../models/owner'
import GitHubRepository from '../models/github-repository'
import Repository from '../models/repository'

function deDexie<T>(promise: Dexie.Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    promise.then(resolve, reject)
  })
}

export default class RepositoriesStore {
  private db: Database

  public constructor(db: Database) {
    this.db = db
  }

  public async getRepositories(): Promise<Repository[]> {
    // const Promise = Dexie.Promise
    const inflatedRepos: Repository[] = []
    const p = this.db.transaction('r', this.db.repositories, this.db.gitHubRepositories, this.db.owners, async () => {
      const repos = await this.db.repositories.toArray()
      for (const repo of repos) {
        let inflatedRepo: Repository = null
        if (repo.gitHubRepositoryID) {
          const gitHubRepository = await this.db.gitHubRepositories.get(repo.gitHubRepositoryID)
          const owner = await this.db.owners.get(gitHubRepository.ownerID)
          inflatedRepo = new Repository(repo.path, new GitHubRepository(gitHubRepository.name, new Owner(owner.login, owner.endpoint)))
        } else {
          inflatedRepo = new Repository(repo.path, null)
        }
        inflatedRepos.push(inflatedRepo)
      }
    })


    await deDexie(p)
    return inflatedRepos
  }

  public addRepository(repo: Repository): Promise<void> {
    const Promise = Dexie.Promise
    const p = this.db.transaction('rw', this.db.repositories, this.db.gitHubRepositories, this.db.owners, async () => {
      let gitHubRepositoryID: number = null
      const gitHubRepository = repo.getGitHubRepository()
      if (gitHubRepository) {
        const login = gitHubRepository.getOwner().getLogin()
        const existingOwner = await this.db.owners.where('login').equalsIgnoreCase(login).limit(1).first()
        let ownerID: number = null
        if (existingOwner) {
          ownerID = existingOwner.id
        } else {
          ownerID = await this.db.owners.add({login, endpoint: gitHubRepository.getOwner().getEndpoint()})
        }

        gitHubRepositoryID = await this.db.gitHubRepositories.add({
          name: gitHubRepository.getName(),
          ownerID
        })
      }

      await this.db.repositories.add({
        path: repo.getPath(),
        gitHubRepositoryID
      })

    })
    return deDexie(p)
  }
}
