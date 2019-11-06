import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
  IDatabaseOwner,
  IDatabaseProtectedBranch,
} from '../databases/repositories-database'
import { Owner } from '../../models/owner'
import { GitHubRepository } from '../../models/github-repository'
import { Repository } from '../../models/repository'
import { fatalError } from '../fatal-error'
import { IAPIRepository, IAPIBranch } from '../api'
import { BaseStore } from './base-store'
import { enableBranchProtectionChecks } from '../feature-flag'

/** The store for local repositories. */
export class RepositoriesStore extends BaseStore {
  private db: RepositoriesDatabase

  // Key-repo ID, Value-date
  private lastStashCheckCache = new Map<number, number>()

  /**
   * Key is the GitHubRepository id, value is the protected branch count reported
   * by the GitHub API.
   */
  private branchProtectionSettingsFoundCache = new Map<number, boolean>()

  /**
   * Key is the lookup by the GitHubRepository id and branch name, value is the
   * flag whether this branch is considered protected by the GitHub API
   */
  private protectionEnabledForBranchCache = new Map<string, boolean>()

  public constructor(db: RepositoriesDatabase) {
    super()

    this.db = db
  }

  /** Find the matching GitHub repository or add it if it doesn't exist. */
  public async upsertGitHubRepository(
    endpoint: string,
    apiRepository: IAPIRepository
  ): Promise<GitHubRepository> {
    return this.db.transaction(
      'rw',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const gitHubRepository = await this.db.gitHubRepositories
          .where('cloneURL')
          .equals(apiRepository.clone_url)
          .limit(1)
          .first()

        if (gitHubRepository == null) {
          return this.putGitHubRepository(endpoint, apiRepository)
        } else {
          return this.buildGitHubRepository(gitHubRepository)
        }
      }
    )
  }

  private async buildGitHubRepository(
    dbRepo: IDatabaseGitHubRepository
  ): Promise<GitHubRepository> {
    const owner = await this.db.owners.get(dbRepo.ownerID)

    if (owner == null) {
      throw new Error(`Couldn't find the owner for ${dbRepo.name}`)
    }

    let parent: GitHubRepository | null = null
    if (dbRepo.parentID) {
      parent = await this.findGitHubRepositoryByID(dbRepo.parentID)
    }

    return new GitHubRepository(
      dbRepo.name,
      new Owner(owner.login, owner.endpoint, owner.id!),
      dbRepo.id!,
      dbRepo.private,
      dbRepo.htmlURL,
      dbRepo.defaultBranch,
      dbRepo.cloneURL,
      dbRepo.permissions,
      parent
    )
  }

  /** Find a GitHub repository by its DB ID. */
  public async findGitHubRepositoryByID(
    id: number
  ): Promise<GitHubRepository | null> {
    const gitHubRepository = await this.db.gitHubRepositories.get(id)
    if (!gitHubRepository) {
      return null
    }

    return this.buildGitHubRepository(gitHubRepository)
  }

  /** Get all the local repositories. */
  public getAll(): Promise<ReadonlyArray<Repository>> {
    return this.db.transaction(
      'r',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const inflatedRepos = new Array<Repository>()
        const repos = await this.db.repositories.toArray()
        for (const repo of repos) {
          let inflatedRepo: Repository | null = null
          let gitHubRepository: GitHubRepository | null = null
          if (repo.gitHubRepositoryID) {
            gitHubRepository = await this.findGitHubRepositoryByID(
              repo.gitHubRepositoryID
            )
          }

          inflatedRepo = new Repository(
            repo.path,
            repo.id!,
            gitHubRepository,
            repo.missing,
            repo.isTutorialRepository
          )
          inflatedRepos.push(inflatedRepo)
        }

        return inflatedRepos
      }
    )
  }

  /**
   * Add a tutorial repository.
   *
   * This method differs from the `addRepository` method in that it
   * requires that the repository has been created on the remote and
   * set up to track it. Given that tutorial repositories are created
   * from the no-repositories blank slate it shouldn't be possible for
   * another repository with the same path to exist but in case that
   * changes in the future this method will set the tutorial flag on
   * the existing repository at the given path.
   */
  public async addTutorialRepository(
    path: string,
    endpoint: string,
    apiRepository: IAPIRepository
  ) {
    await this.db.transaction(
      'rw',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const gitHubRepository = await this.upsertGitHubRepository(
          endpoint,
          apiRepository
        )

        const existingRepo = await this.db.repositories.get({ path })
        const existingRepoId =
          existingRepo && existingRepo.id !== null ? existingRepo.id : undefined

        return await this.db.repositories.put(
          {
            path,
            gitHubRepositoryID: gitHubRepository.dbID,
            missing: false,
            lastStashCheckDate: null,
            isTutorialRepository: true,
          },
          existingRepoId
        )
      }
    )

    this.emitUpdate()
  }

  /**
   * Add a new local repository.
   *
   * If a repository already exists with that path, it will be returned instead.
   */
  public async addRepository(path: string): Promise<Repository> {
    const repository = await this.db.transaction(
      'rw',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const repos = await this.db.repositories.toArray()
        const record = repos.find(r => r.path === path)
        let recordId: number
        let gitHubRepo: GitHubRepository | null = null

        if (record != null) {
          recordId = record.id!

          if (record.gitHubRepositoryID != null) {
            gitHubRepo = await this.findGitHubRepositoryByID(
              record.gitHubRepositoryID
            )
          }
        } else {
          recordId = await this.db.repositories.add({
            path,
            gitHubRepositoryID: null,
            missing: false,
            lastStashCheckDate: null,
          })
        }

        return new Repository(path, recordId, gitHubRepo, false)
      }
    )

    this.emitUpdate()

    return repository
  }

  /** Remove the repository with the given ID. */
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

    await this.db.repositories.update(repoID, { missing })

    this.emitUpdate()

    return new Repository(
      repository.path,
      repository.id,
      repository.gitHubRepository,
      missing,
      repository.isTutorialRepository
    )
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

    await this.db.repositories.update(repoID, {
      missing: false,
      path,
    })

    this.emitUpdate()

    return new Repository(
      path,
      repository.id,
      repository.gitHubRepository,
      false,
      repository.isTutorialRepository
    )
  }

  /**
   * Sets the last time the repository was checked for stash entries
   *
   * @param repository The repository in which to update the last stash check date for
   * @param date The date and time in which the last stash check took place; defaults to
   * the current time
   */
  public async updateLastStashCheckDate(
    repository: Repository,
    date: number = Date.now()
  ): Promise<void> {
    const repoID = repository.id
    if (repoID === 0) {
      return fatalError(
        '`updateLastStashCheckDate` can only update the last stash check date for a repository which has been added to the database.'
      )
    }

    await this.db.repositories.update(repoID, {
      lastStashCheckDate: date,
    })

    this.lastStashCheckCache.set(repoID, date)

    this.emitUpdate()
  }

  /**
   * Gets the last time the repository was checked for stash entries
   *
   * @param repository The repository in which to update the last stash check date for
   */
  public async getLastStashCheckDate(
    repository: Repository
  ): Promise<number | null> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`getLastStashCheckDate` - can only retrieve the last stash check date for a repositories that have been stored in the database.'
      )
    }

    let lastCheckDate = this.lastStashCheckCache.get(repoID) || null
    if (lastCheckDate !== null) {
      return lastCheckDate
    }

    const record = await this.db.repositories.get(repoID)

    if (record === undefined) {
      return fatalError(
        `'getLastStashCheckDate' - unable to find repository with ID: ${repoID}`
      )
    }

    lastCheckDate = record.lastStashCheckDate
    if (lastCheckDate !== null) {
      this.lastStashCheckCache.set(repoID, lastCheckDate)
    }

    return lastCheckDate
  }

  private async putOwner(endpoint: string, login: string): Promise<Owner> {
    login = login.toLowerCase()

    const existingOwner = await this.db.owners
      .where('[endpoint+login]')
      .equals([endpoint, login])
      .first()
    if (existingOwner) {
      return new Owner(login, endpoint, existingOwner.id!)
    }

    const dbOwner: IDatabaseOwner = {
      login,
      endpoint,
    }
    const id = await this.db.owners.add(dbOwner)
    return new Owner(login, endpoint, id)
  }

  private async putGitHubRepository(
    endpoint: string,
    gitHubRepository: IAPIRepository
  ): Promise<GitHubRepository> {
    let parent: GitHubRepository | null = null
    if (gitHubRepository.parent) {
      parent = await this.putGitHubRepository(endpoint, gitHubRepository.parent)
    }

    const login = gitHubRepository.owner.login.toLowerCase()
    const owner = await this.putOwner(endpoint, login)
    const permissions = gitHubRepository.permissions.admin
      ? 'admin'
      : gitHubRepository.permissions.push
      ? 'write'
      : gitHubRepository.permissions.pull
      ? 'read'
      : null

    const existingRepo = await this.db.gitHubRepositories
      .where('[ownerID+name]')
      .equals([owner.id!, gitHubRepository.name])
      .first()

    let updatedGitHubRepo: IDatabaseGitHubRepository = {
      ownerID: owner.id!,
      name: gitHubRepository.name,
      private: gitHubRepository.private,
      htmlURL: gitHubRepository.html_url,
      defaultBranch: gitHubRepository.default_branch,
      cloneURL: gitHubRepository.clone_url,
      parentID: parent ? parent.dbID : null,
      lastPruneDate: null,
      permissions,
    }
    if (existingRepo) {
      updatedGitHubRepo = { ...updatedGitHubRepo, id: existingRepo.id }
    }

    const id = await this.db.gitHubRepositories.put(updatedGitHubRepo)
    return new GitHubRepository(
      updatedGitHubRepo.name,
      owner,
      id,
      updatedGitHubRepo.private,
      updatedGitHubRepo.htmlURL,
      updatedGitHubRepo.defaultBranch,
      updatedGitHubRepo.cloneURL,
      updatedGitHubRepo.permissions,
      parent
    )
  }

  /** Add or update the repository's GitHub repository. */
  public async updateGitHubRepository(
    repository: Repository,
    endpoint: string,
    gitHubRepository: IAPIRepository
  ): Promise<Repository> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`updateGitHubRepository` can only update a GitHub repository for a repository which has been added to the database.'
      )
    }

    const updatedGitHubRepo = await this.db.transaction(
      'rw',
      this.db.repositories,
      this.db.gitHubRepositories,
      this.db.owners,
      async () => {
        const localRepo = (await this.db.repositories.get(repoID))!
        const updatedGitHubRepo = await this.putGitHubRepository(
          endpoint,
          gitHubRepository
        )

        await this.db.repositories.update(localRepo.id!, {
          gitHubRepositoryID: updatedGitHubRepo.dbID,
        })

        return updatedGitHubRepo
      }
    )

    this.emitUpdate()

    return new Repository(
      repository.path,
      repository.id,
      updatedGitHubRepo,
      repository.missing,
      repository.isTutorialRepository
    )
  }

  /** Add or update the branch protections associated with a GitHub repository. */
  public async updateBranchProtections(
    gitHubRepository: GitHubRepository,
    protectedBranches: ReadonlyArray<IAPIBranch>
  ): Promise<void> {
    if (!enableBranchProtectionChecks()) {
      return
    }

    const dbID = gitHubRepository.dbID
    if (!dbID) {
      return fatalError(
        '`updateBranchProtections` can only update a GitHub repository for a repository which has been added to the database.'
      )
    }

    await this.db.transaction('rw', this.db.protectedBranches, async () => {
      // This update flow is organized into two stages:
      //
      // - update the in-memory cache
      // - update the underyling database state
      //
      // This should ensure any stale values are not being used, and avoids
      // the need to query the database while the results are in memory.

      const prefix = getKeyPrefix(dbID)

      for (const key of this.protectionEnabledForBranchCache.keys()) {
        // invalidate any cached entries belonging to this repository
        if (key.startsWith(prefix)) {
          this.protectionEnabledForBranchCache.delete(key)
        }
      }

      const branchRecords = protectedBranches.map<IDatabaseProtectedBranch>(
        b => ({
          repoId: dbID,
          name: b.name,
        })
      )

      // update cached values to avoid database lookup
      for (const item of branchRecords) {
        const key = getKey(dbID, item.name)
        this.protectionEnabledForBranchCache.set(key, true)
      }

      await this.db.protectedBranches
        .where('repoId')
        .equals(dbID)
        .delete()

      const protectionsFound = branchRecords.length > 0
      this.branchProtectionSettingsFoundCache.set(dbID, protectionsFound)

      if (branchRecords.length > 0) {
        await this.db.protectedBranches.bulkAdd(branchRecords)
      }
    })

    this.emitUpdate()
  }

  /**
   * Set's the last time the repository was checked for pruning
   *
   * @param repository The repository in which to update the prune date for
   * @param date The date and time in which the last prune took place
   */
  public async updateLastPruneDate(
    repository: Repository,
    date: number
  ): Promise<void> {
    const repoID = repository.id
    if (repoID === 0) {
      return fatalError(
        '`updateLastPruneDate` can only update the last prune date for a repository which has been added to the database.'
      )
    }

    const githubRepo = repository.gitHubRepository
    if (githubRepo === null) {
      return fatalError(
        `'updateLastPruneDate' can only update GitHub repositories`
      )
    }

    const gitHubRepositoryID = githubRepo.dbID
    if (gitHubRepositoryID === null) {
      return fatalError(
        `'updateLastPruneDate' can only update GitHub repositories with a valid ID: received ID of ${gitHubRepositoryID}`
      )
    }

    await this.db.gitHubRepositories.update(gitHubRepositoryID, {
      lastPruneDate: date,
    })

    this.emitUpdate()
  }

  public async getLastPruneDate(
    repository: Repository
  ): Promise<number | null> {
    const repoID = repository.id
    if (!repoID) {
      return fatalError(
        '`getLastPruneDate` - can only retrieve the last prune date for a repositories that have been stored in the database.'
      )
    }

    const githubRepo = repository.gitHubRepository
    if (githubRepo === null) {
      return fatalError(
        `'getLastPruneDate' - can only retrieve the last prune date for GitHub repositories.`
      )
    }

    const gitHubRepositoryID = githubRepo.dbID
    if (gitHubRepositoryID === null) {
      return fatalError(
        `'getLastPruneDate' - can only retrieve the last prune date for GitHub repositories that have been stored in the database.`
      )
    }

    const record = await this.db.gitHubRepositories.get(gitHubRepositoryID)

    if (record === undefined) {
      return fatalError(
        `'getLastPruneDate' - unable to find GitHub repository with ID: ${gitHubRepositoryID}`
      )
    }

    return record!.lastPruneDate
  }

  /**
   * Load the branch protection information for a repository from the database
   * and cache the results in memory
   */
  private async loadAndCacheBranchProtection(dbID: number) {
    // query the database to find any protected branches
    const branches = await this.db.protectedBranches
      .where('repoId')
      .equals(dbID)
      .toArray()

    const branchProtectionsFound = branches.length > 0
    this.branchProtectionSettingsFoundCache.set(dbID, branchProtectionsFound)

    // fill the retrieved records into the per-branch cache
    for (const branch of branches) {
      const key = getKey(dbID, branch.name)
      this.protectionEnabledForBranchCache.set(key, true)
    }

    return branchProtectionsFound
  }

  /**
   * Check if any branch protection settings are enabled for the repository
   * through the GitHub API.
   */
  public async hasBranchProtectionsConfigured(
    gitHubRepository: GitHubRepository
  ): Promise<boolean> {
    if (gitHubRepository.dbID === null) {
      return fatalError(
        'unable to get protected branches, GitHub repository has a null dbID'
      )
    }

    const { dbID } = gitHubRepository
    const branchProtectionsFound = this.branchProtectionSettingsFoundCache.get(
      dbID
    )

    if (branchProtectionsFound === undefined) {
      return this.loadAndCacheBranchProtection(dbID)
    }

    return branchProtectionsFound
  }

  /**
   * Check if the given branch for the repository is protected through the
   * GitHub API.
   */
  public async isBranchProtectedOnRemote(
    gitHubRepository: GitHubRepository,
    branchName: string
  ): Promise<boolean> {
    if (gitHubRepository.dbID === null) {
      return fatalError(
        'unable to get protected branches, GitHub repository has a null dbID'
      )
    }

    const { dbID } = gitHubRepository
    const key = getKey(dbID, branchName)

    const cachedProtectionValue = this.protectionEnabledForBranchCache.get(key)
    if (cachedProtectionValue === true) {
      return cachedProtectionValue
    }

    const databaseValue = await this.db.protectedBranches.get([
      dbID,
      branchName,
    ])

    // if no row found, this means no protection is found for the branch
    const value = databaseValue !== undefined

    this.protectionEnabledForBranchCache.set(key, value)

    return value
  }
}

/** Compute the key for the branch protection cache */
function getKey(dbID: number, branchName: string) {
  return `${getKeyPrefix(dbID)}${branchName}`
}

/** Compute the key prefix for the branch protection cache */
function getKeyPrefix(dbID: number) {
  return `${dbID}-`
}
