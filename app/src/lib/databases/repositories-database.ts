import Dexie, { Transaction } from 'dexie'
import { BaseDatabase } from './base-database'
import { WorkflowPreferences } from '../../models/workflow-preferences'
import { assertNonNullable } from '../fatal-error'
import { GitHubAccountType } from '../api'

export interface IDatabaseOwner {
  readonly id?: number
  /**
   * A case-insensitive lookup key which uniquely identifies a particular
   * user on a particular endpoint. See getOwnerKey for more information.
   */
  readonly key: string
  readonly login: string
  readonly endpoint: string
  readonly type?: GitHubAccountType
}

export interface IDatabaseGitHubRepository {
  readonly id?: number
  readonly ownerID: number
  readonly name: string
  readonly private: boolean | null
  readonly htmlURL: string | null
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
  readonly alias: string | null
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
  public declare repositories: Dexie.Table<IDatabaseRepository, number>

  /** The GitHub repositories table. */
  public declare gitHubRepositories: Dexie.Table<
    IDatabaseGitHubRepository,
    number
  >

  /** A table containing the names of protected branches per repository. */
  public declare protectedBranches: Dexie.Table<
    IDatabaseProtectedBranch,
    BranchKey
  >

  /** The GitHub repository owners table. */
  public declare owners: Dexie.Table<IDatabaseOwner, number>

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
    this.conditionalVersion(9, { owners: '++id, &key' }, createOwnerKey)
  }
}

/**
 * Remove any duplicate GitHub repositories that have the same owner and name.
 */
function removeDuplicateGitHubRepositories(transaction: Transaction) {
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

async function ensureNoUndefinedParentID(tx: Transaction) {
  return tx
    .table<IDatabaseGitHubRepository, number>('gitHubRepositories')
    .toCollection()
    .filter(ghRepo => ghRepo.parentID === undefined)
    .modify({ parentID: null })
    .then(modified => log.info(`ensureNoUndefinedParentID: ${modified}`))
}

/**
 * Replace the case-sensitive [endpoint+login] index with a case-insensitive
 * lookup key in order to allow us to persist the proper case of a login.
 *
 * In addition to adding the key this transition will, out of an abundance of
 * caution, guard against the possibility that the previous table (being
 * case-sensitive) will contain two rows for the same user (only differing in
 * case). This could happen if the Desktop installation as been constantly
 * transitioned since before we started storing logins in lower case
 * (https://github.com/desktop/desktop/pull/1242). This scenario ought to be
 * incredibly unlikely.
 */
async function createOwnerKey(tx: Transaction) {
  const ownersTable = tx.table<IDatabaseOwner, number>('owners')
  const ghReposTable = tx.table<IDatabaseGitHubRepository, number>(
    'gitHubRepositories'
  )
  const allOwners = await ownersTable.toArray()

  const ownerByKey = new Map<string, IDatabaseOwner>()
  const newOwnerIds = new Array<{ from: number; to: number }>()
  const ownersToDelete = new Array<number>()

  for (const owner of allOwners) {
    assertNonNullable(owner.id, 'Missing owner id')

    const key = getOwnerKey(owner.endpoint, owner.login)
    const existingOwner = ownerByKey.get(key)

    // If we've found a duplicate owner where that only differs by case we
    // can't know which one of the two is accurate but that doesn't matter
    // as it will eventually get corrected from fresh API data, we just need
    // to pick one over the other and update any GitHubRepository still pointing
    // to the owner to be deleted.
    if (existingOwner !== undefined) {
      assertNonNullable(existingOwner.id, 'Missing existing owner id')
      log.warn(
        `createOwnerKey: Conflicting owner data ${owner.id} (${owner.login}) and ${existingOwner.id} (${existingOwner.login})`
      )
      newOwnerIds.push({ from: owner.id, to: existingOwner.id })
      ownersToDelete.push(owner.id)
    } else {
      ownerByKey.set(key, { ...owner, key })
    }
  }

  log.info(`createOwnerKey: Updating ${ownerByKey.size} owners with keys`)
  await ownersTable.bulkPut([...ownerByKey.values()])

  for (const mapping of newOwnerIds) {
    const modified = await ghReposTable
      .where('[ownerID+name]')
      .between([mapping.from], [mapping.from + 1])
      .modify({ ownerID: mapping.to })

    log.info(`createOwnerKey: ${modified} repositories got new owner ids`)
  }

  await ownersTable.bulkDelete(ownersToDelete)
}

/* Creates a case-insensitive key used to uniquely identify an owner
 * based on the endpoint and login. Note that the key happens to
 * match the canonical API url for the user. This has no practical
 * purpose but can make debugging a little bit easier.
 */
export function getOwnerKey(endpoint: string, login: string) {
  return `${endpoint}/users/${login}`.toLowerCase()
}
