import { Database, IDatabaseGitHubRepository, IDatabaseRepository } from './database'
import { Owner } from '../models/owner'
import { GitHubRepository } from '../models/github-repository'
import { Repository } from '../models/repository'
import { fatalError } from '../lib/fatal-error'

// NB: We can't use async/await within Dexie transactions. This is because Dexie
// uses its own Promise implementation and TypeScript doesn't know about it. See
// https://github.com/dfahlander/Dexie.js/wiki/Typescript#async-and-await, but
// note that their proposed work around doesn't seem to, you know, work, as of
// TS 1.8.
//
// Instead of using async/await, use generator functions and `yield`.

/** The store for local repositories. */
export class RepositoriesStore {
  private db: Database

  public constructor(db: Database) {
    this.db = db
  }

  /** Get all the local repositories. */
  public async getRepositories(): Promise<ReadonlyArray<Repository>> {
    const inflatedRepos: Repository[] = []
    const db = this.db
    const transaction = this.db.transaction('r', this.db.repositories, this.db.gitHubRepositories, this.db.owners, function*(){
      const repos = yield db.repositories.toArray()
      for (const repo of repos) {
        let inflatedRepo: Repository | null = null
        if (repo.gitHubRepositoryID) {
          const gitHubRepository = yield db.gitHubRepositories.get(repo.gitHubRepositoryID)
          const owner = yield db.owners.get(gitHubRepository.ownerID)
          const gitHubRepo = new GitHubRepository(gitHubRepository.name, new Owner(owner.login, owner.endpoint), gitHubRepository.id, gitHubRepository.private, gitHubRepository.fork, gitHubRepository.htmlURL, gitHubRepository.defaultBranch)
          inflatedRepo = new Repository(repo.path, repo.id, gitHubRepo)
        } else {
          inflatedRepo = new Repository(repo.path, repo.id)
        }
        inflatedRepos.push(inflatedRepo)
      }
    })

    await transaction

    return inflatedRepos
  }

  /** Add a new local repository. */
  public async addRepository(path: string): Promise<Repository> {
    let repository: Repository | null = null

    const db = this.db
    const transaction = this.db.transaction('r', this.db.repositories, this.db.gitHubRepositories, this.db.owners, function*(){
      const repos: Array<IDatabaseRepository> = yield db.repositories.toArray()
      const existing = repos.find(r => r.path === path)
      if (existing === undefined) {
        return
      }

      const id = existing.id!

      if (!existing.gitHubRepositoryID) {
        repository = new Repository(path, id)
        return
      }

      const dbRepo = yield db.gitHubRepositories.get(existing.gitHubRepositoryID)
      const dbOwner = yield db.owners.get(dbRepo.ownerID)

      const owner = new Owner(dbOwner.login, dbOwner.endpoint)
      const gitHubRepo = new GitHubRepository(dbRepo.name, owner, existing.gitHubRepositoryID, dbRepo.private, dbRepo.fork, dbRepo.htmlURL, dbRepo.defaultBranch)
      repository = new Repository(path, id, gitHubRepo)
    })

    await transaction

    if (repository !== null) {
      return repository
    }

    const id = await this.db.repositories.add({
      path,
      gitHubRepositoryID: null,
      missing: false,
    })
    return new Repository(path, id)
  }

  public async removeRepository(repoID: number): Promise<void> {
    await this.db.repositories.delete(repoID)
  }

  /** Update or add the repository's GitHub repository. */
  public async updateGitHubRepository(repository: Repository): Promise<Repository> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError('`updateGitHubRepository` can only update a GitHub repository for a repository which has been added to the database.')
    }

    const newGitHubRepo = repository.gitHubRepository
    if (!newGitHubRepo) {
      return fatalError('`updateGitHubRepository` can only update a GitHub repository. It cannot remove one.')
    }

    let gitHubRepositoryID: number | null = null
    const db = this.db
    const transaction = this.db.transaction('rw', this.db.repositories, this.db.gitHubRepositories, this.db.owners, function*() {
      const localRepo = yield db.repositories.get(repoID)

      let existingGitHubRepo: IDatabaseGitHubRepository | null = null
      let ownerID: number | null = null
      if (localRepo.gitHubRepositoryID) {
        gitHubRepositoryID = localRepo.gitHubRepositoryID

        existingGitHubRepo = yield db.gitHubRepositories.get(localRepo.gitHubRepositoryID)
        if (!existingGitHubRepo) {
          return fatalError(`Couldn't look up an existing GitHub repository.`)
        }

        const owner = yield db.owners.get(existingGitHubRepo.ownerID)
        ownerID = owner.id
      } else {
        const owner = newGitHubRepo.owner
        const existingOwner = yield db.owners
          .where('login')
          .equalsIgnoreCase(owner.login)
          .limit(1)
          .first()
        if (existingOwner) {
          ownerID = existingOwner.id
        } else {
          ownerID = yield db.owners.add({ login: owner.login, endpoint: owner.endpoint })
        }
      }

      const info: any = {
        private: newGitHubRepo.private,
        fork: newGitHubRepo.fork,
        htmlURL: newGitHubRepo.htmlURL,
        name: newGitHubRepo.name,
        ownerID,
      }

      if (existingGitHubRepo) {
        info.id = existingGitHubRepo.id
      }

      gitHubRepositoryID = yield db.gitHubRepositories.put(info)
      yield db.repositories.update(localRepo.id, { gitHubRepositoryID })
    })

    await transaction

    return repository.withGitHubRepository(new GitHubRepository(newGitHubRepo.name, newGitHubRepo.owner, gitHubRepositoryID!, newGitHubRepo.private, newGitHubRepo.fork, newGitHubRepo.htmlURL, newGitHubRepo.defaultBranch))
  }
}
