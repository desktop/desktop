import Database, {deDexie} from './database'
import Owner from '../models/owner'
import GitHubRepository from '../models/github-repository'
import Repository from '../models/repository'

// NB: We can't use async/await within Dexie transactions. This is because Dexie
// uses its own Promise implementation and TypeScript doesn't know about it. See
// https://github.com/dfahlander/Dexie.js/wiki/Typescript#async-and-await, but
// note that their proposed work around doesn't seem to, you know, work, as of
// TS 1.8.
//
// Instead of using async/await, use generator functions and `yield`.

/** The store for local repositories. */
export default class RepositoriesStore {
  private db: Database

  public constructor(db: Database) {
    this.db = db
  }

  /** Get all the local repositories. */
  public async getRepositories(): Promise<Repository[]> {
    const inflatedRepos: Repository[] = []
    const db = this.db
    const transaction = this.db.transaction('r', this.db.repositories, this.db.gitHubRepositories, this.db.owners, function*(){
      const repos = yield db.repositories.toArray()
      for (const repo of repos) {
        let inflatedRepo: Repository = null
        if (repo.gitHubRepositoryID) {
          const gitHubRepository = yield db.gitHubRepositories.get(repo.gitHubRepositoryID)
          const owner = yield db.owners.get(gitHubRepository.ownerID)

          const inflatedGitHubRepository = new GitHubRepository(gitHubRepository.name, new Owner(owner.login, owner.endpoint), gitHubRepository.apiID, gitHubRepository.cloneURL, gitHubRepository.gitURL, gitHubRepository.sshURL, gitHubRepository.htmlURL, gitHubRepository.id)
          inflatedRepo = new Repository(repo.path, inflatedGitHubRepository)
        } else {
          inflatedRepo = new Repository(repo.path, null)
        }
        inflatedRepos.push(inflatedRepo)
      }
    })

    await deDexie(transaction)

    return inflatedRepos
  }

  /** Add a new local repository. */
  public async addRepository(repo: Repository): Promise<void> {
    const db = this.db
    const transaction = this.db.transaction('rw', this.db.repositories, this.db.gitHubRepositories, this.db.owners, function*() {
      let gitHubRepositoryID: number = null
      const gitHubRepository = repo.getGitHubRepository()
      if (gitHubRepository) {
        const match = yield db.gitHubRepositories.get(gitHubRepository.getDBID())
        gitHubRepositoryID = match.id
      }

      yield db.repositories.add({
        path: repo.getPath(),
        gitHubRepositoryID
      })
    })

    await deDexie(transaction)
  }
}
