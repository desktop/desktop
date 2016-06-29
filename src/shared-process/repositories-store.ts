import Dexie from 'dexie'
import Database from './database'
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

  public getRepositories(): Promise<Repository[]> {
    return deDexie(this.db.repositories.toArray())
  }

  public addRepository(repo: Repository): Promise<void> {
    const Promise = Dexie.Promise
    const p = this.db.transaction('rw', this.db.repositories, this.db.gitHubRepositories, this.db.owners, async () => {
      let gitHubRepositoryID: number = null
      if (repo.gitHubRepository) {
        const ownerID = await this.db.owners.add({login: repo.gitHubRepository.owner.login})
        gitHubRepositoryID = await this.db.gitHubRepositories.add({
          name: repo.gitHubRepository.name,
          ownerID
        })
      }
      await this.db.repositories.add({
        path: repo.path,
        gitHubRepositoryID
      })

    })
    return deDexie(p)
  }
}
