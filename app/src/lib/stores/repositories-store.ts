import { Emitter, Disposable } from 'event-kit'
import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
} from '../databases/repositories-database'
import { Owner } from '../../models/owner'
import { GitHubRepository } from '../../models/github-repository'
import { Repository } from '../../models/repository'
import { fatalError } from '../fatal-error'

/** The store for local repositories. */
export class RepositoriesStore {
  private db: RepositoriesDatabase

  private readonly emitter = new Emitter()

  public constructor(db: RepositoriesDatabase) {
    this.db = db
  }

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Get all the local repositories. */
  public async getAll(): Promise<ReadonlyArray<Repository>> {
    const inflatedRepos: Repository[] = []
    await this.db.transaction(
      'r',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const repos = await this.db.repositories.toArray()
        for (const repo of repos) {
          let inflatedRepo: Repository | null = null
          if (repo.gitHubRepositoryID) {
            const gitHubRepository = (await this.db.gitHubRepositories.get(
              repo.gitHubRepositoryID
            ))!
            const owner = (await this.db.owners.get(gitHubRepository.ownerID))!
            const gitHubRepo = new GitHubRepository(
              gitHubRepository.name,
              new Owner(owner.login, owner.endpoint),
              gitHubRepository.id!,
              gitHubRepository.private,
              gitHubRepository.fork,
              gitHubRepository.htmlURL,
              gitHubRepository.defaultBranch,
              gitHubRepository.cloneURL
            )
            inflatedRepo = new Repository(
              repo.path,
              repo.id!,
              gitHubRepo,
              repo.missing
            )
          } else {
            inflatedRepo = new Repository(
              repo.path,
              repo.id!,
              null,
              repo.missing
            )
          }
          inflatedRepos.push(inflatedRepo)
        }
      }
    )

    return inflatedRepos
  }

  /** Add a new local repository. */
  public async addRepository(path: string): Promise<Repository> {
    let repository: Repository | null = null

    await this.db.transaction(
      'r',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const repos = await this.db.repositories.toArray()
        const existing = repos.find(r => r.path === path)
        if (existing === undefined) {
          return
        }

        const id = existing.id!

        if (!existing.gitHubRepositoryID) {
          repository = new Repository(path, id, null, false)
          return
        }

        const dbRepo = (await this.db.gitHubRepositories.get(
          existing.gitHubRepositoryID
        ))!
        const dbOwner = (await this.db.owners.get(dbRepo.ownerID))!

        const owner = new Owner(dbOwner.login, dbOwner.endpoint)
        const gitHubRepo = new GitHubRepository(
          dbRepo.name,
          owner,
          existing.gitHubRepositoryID,
          dbRepo.private,
          dbRepo.fork,
          dbRepo.htmlURL,
          dbRepo.defaultBranch,
          dbRepo.cloneURL
        )
        repository = new Repository(path, id, gitHubRepo, false)
      }
    )

    if (repository !== null) {
      return repository
    }

    const id = await this.db.repositories.add({
      path,
      gitHubRepositoryID: null,
      missing: false,
    })

    this.emitUpdate()

    return new Repository(path, id, null, false)
  }

  public async removeRepository(repoID: number): Promise<void> {
    await this.db.repositories.delete(repoID)

    this.emitUpdate()
  }

  /** Update the repository's `missing` flag. */
  public async updateRepositoryMissing(
    repository: Repository,
    missing: boolean
  ): Promise<Repository> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`updateRepositoryMissing` can only update `missing` for a repository which has been added to the database.'
      )
    }

    const updatedRepository = repository.withMissing(missing)
    const gitHubRepositoryID = updatedRepository.gitHubRepository
      ? updatedRepository.gitHubRepository.dbID
      : null
    await this.db.repositories.put({
      id: updatedRepository.id,
      path: updatedRepository.path,
      missing: updatedRepository.missing,
      gitHubRepositoryID,
    })

    this.emitUpdate()

    return updatedRepository
  }

  /** Update the repository's path. */
  public async updateRepositoryPath(
    repository: Repository,
    path: string
  ): Promise<Repository> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`updateRepositoryPath` can only update the path for a repository which has been added to the database.'
      )
    }

    const updatedRepository = repository.withPath(path)
    const gitHubRepositoryID = updatedRepository.gitHubRepository
      ? updatedRepository.gitHubRepository.dbID
      : null
    await this.db.repositories.put({
      id: updatedRepository.id,
      missing: updatedRepository.missing,
      path: updatedRepository.path,
      gitHubRepositoryID,
    })

    const foundRepository = await this.updateRepositoryMissing(
      updatedRepository,
      false
    )

    this.emitUpdate()

    return foundRepository
  }

  /** Update or add the repository's GitHub repository. */
  public async updateGitHubRepository(
    repository: Repository
  ): Promise<Repository> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`updateGitHubRepository` can only update a GitHub repository for a repository which has been added to the database.'
      )
    }

    const newGitHubRepo = repository.gitHubRepository
    if (!newGitHubRepo) {
      return fatalError(
        '`updateGitHubRepository` can only update a GitHub repository. It cannot remove one.'
      )
    }

    let gitHubRepositoryID: number | null = null
    await this.db.transaction(
      'rw',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const localRepo = (await this.db.repositories.get(repoID))!

        let existingGitHubRepo: IDatabaseGitHubRepository | null = null
        let ownerID: number | null = null
        if (localRepo.gitHubRepositoryID) {
          gitHubRepositoryID = localRepo.gitHubRepositoryID

          existingGitHubRepo =
            (await this.db.gitHubRepositories.get(
              localRepo.gitHubRepositoryID
            )) || null
          if (!existingGitHubRepo) {
            return fatalError(`Couldn't look up an existing GitHub repository.`)
          }

          const owner = (await this.db.owners.get(existingGitHubRepo.ownerID))!
          ownerID = owner.id || null
        } else {
          const owner = newGitHubRepo.owner
          const existingOwner = await this.db.owners
            .where('[endpoint+login]')
            .equals([owner.endpoint, owner.login.toLowerCase()])
            .limit(1)
            .first()
          if (existingOwner) {
            ownerID = existingOwner.id || null
          } else {
            ownerID = await this.db.owners.add({
              login: owner.login.toLowerCase(),
              endpoint: owner.endpoint,
            })
          }
        }

        let updatedInfo: IDatabaseGitHubRepository = {
          private: newGitHubRepo.private,
          fork: newGitHubRepo.fork,
          htmlURL: newGitHubRepo.htmlURL,
          name: newGitHubRepo.name,
          ownerID: ownerID!,
          cloneURL: newGitHubRepo.cloneURL,
          defaultBranch: newGitHubRepo.defaultBranch,
        }

        if (existingGitHubRepo) {
          updatedInfo = { ...updatedInfo, id: existingGitHubRepo.id }
        }

        gitHubRepositoryID = await this.db.gitHubRepositories.put(updatedInfo)
        await this.db.repositories.update(localRepo.id!, { gitHubRepositoryID })
      }
    )

    this.emitUpdate()

    return repository.withGitHubRepository(
      new GitHubRepository(
        newGitHubRepo.name,
        newGitHubRepo.owner,
        gitHubRepositoryID!,
        newGitHubRepo.private,
        newGitHubRepo.fork,
        newGitHubRepo.htmlURL,
        newGitHubRepo.defaultBranch,
        newGitHubRepo.cloneURL
      )
    )
  }
}
