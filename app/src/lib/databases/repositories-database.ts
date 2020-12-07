import Dexie from 'dexie'
import { BaseDatabase } from './base-database'
import { WorkflowPreferences } from '../../models/workflow-preferences'

export interface IDatabaseOwner {
  readonly id?: number
  readonly login: string
  readonly endpoint: string
}

export interface IDatabaseGitHubRepository {
  readonly id?: number
  readonly ownerID: number
  readonly name: string
  readonly private: boolean | null
  readonly htmlURL: string | null
  readonly defaultBranch: string | null
  readonly cloneURL: string | null

  /** The database ID of the parent repository if the repository is a fork. */
  readonly parentID: number | null

  /** The last time a prune was attempted on the repository */
  readonly lastPruneDate: number | null

  readonly issuesEnabled?: boolean
  readonly isArchived?: boolean

  readonly permissions?: 'read' | 'write' | 'admin' | null
}

/** A record to track the protected branch information for a GitHub repository */
export interface IDatabaseProtectedBranch {
  readonly repoId: number
  /**
   * The branch name associated with the branch protection settings
   *
   * NOTE: this is NOT a fully-qualified ref (i.e. `refs/heads/main`)
   */
  readonly name: string
}

export interface IDatabaseRepository {
  readonly id?: number
  readonly gitHubRepositoryID: number | null
  readonly path: string
  readonly missing: boolean

  /** The last time the stash entries were checked for the repository */
  readonly lastStashCheckDate?: number | null

  readonly workflowPreferences?: WorkflowPreferences

  /**
   * True if the repository is a tutorial repository created as part
   * of the onboarding flow. Tutorial repositories trigger a tutorial
   * user experience which introduces new users to some core concepts
   * of Git and GitHub.
   */
  readonly isTutorialRepository?: boolean
}

/**
 * Branches are keyed on the ID of the GitHubRepository that they belong to
 * and the short name of the branch.
 */
type BranchKey = [number, string]

/** The repositories database. */
export class RepositoriesDatabase extends BaseDatabase {
  /** The local repositories table. */
  public repositories!: Dexie.Table<IDatabaseRepository, number>

  /** The GitHub repositories table. */
  public gitHubRepositories!: Dexie.Table<IDatabaseGitHubRepository, number>

  /** A table containing the names of protected branches per repository. */
  public protectedBranches!: Dexie.Table<IDatabaseProtectedBranch, BranchKey>

  /** The GitHub repository owners table. */
  public owners!: Dexie.Table<IDatabaseOwner, number>

  /**
   * Initialize a new repository database.
   *
   * name          - The name of the database.
   * schemaVersion - The version of the schema to use. If not provided, the
   *                 database will be created with the latest version.
   */
  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      repositories: '++id, &path',
      gitHubRepositories: '++id, name',
      owners: '++id, login',
    })

    this.conditionalVersion(2, {
      owners: '++id, &[endpoint+login]',
    })

    // We're adding a new index with a uniqueness constraint in the *next*
    // version and its upgrade callback only happens *after* the schema's been
    // changed. So we need to prepare for it by removing any old data now
    // which will violate it.
    this.conditionalVersion(3, {}, removeDuplicateGitHubRepositories)

    this.conditionalVersion(4, {
      gitHubRepositories: '++id, name, &[ownerID+name]',
    })

    this.conditionalVersion(5, {
      gitHubRepositories: '++id, name, &[ownerID+name], cloneURL',
    })

    this.conditionalVersion(6, {
      protectedBranches: '[repoId+name], repoId',
    })

    this.conditionalVersion(7, {
      gitHubRepositories: '++id, &[ownerID+name]',
    })

    this.conditionalVersion(8, {}, ensureNoUndefinedParentID)
  }
}

/**
 * Remove any duplicate GitHub repositories that have the same owner and name.
 */
function removeDuplicateGitHubRepositories(transaction: Dexie.Transaction) {
  const table = transaction.table<IDatabaseGitHubRepository, number>(
    'gitHubRepositories'
  )

  const seenKeys = new Set<string>()
  return table.toCollection().each(repo => {
    const key = `${repo.ownerID}+${repo.name}`
    if (seenKeys.has(key)) {
      // We can be sure `id` isn't null since we just got it from the
      // database.
      const id = repo.id!

      table.delete(id)
    } else {
      seenKeys.add(key)
    }
  })
}

async function ensureNoUndefinedParentID(tx: Dexie.Transaction) {
  return tx
    .table<IDatabaseGitHubRepository, number>('gitHubRepositories')
    .toCollection()
    .filter(ghRepo => ghRepo.parentID === undefined)
    .modify({ parentID: null })
    .then(modified => log.info(`ensureNoUndefinedParentID: ${modified}`))
}
