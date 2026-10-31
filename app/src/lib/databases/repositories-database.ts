import Dexie, { Transaction } from 'dexie'
import { BaseDatabase } from './base-database'
import { WorkflowPreferences } from '../../models/workflow-preferences'
import { assertNonNullable } from '../fatal-error'
import { GitHubAccountType } from '../api'
import { isGHE } from '../endpoint-capabilities'
import { getMigratedGHEEndpoint } from '../ghe-endpoint-migration'

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

  /** The path to the .git directory for this repository */
  readonly gitDir?: string

  /**
   * The path to the main worktree of this repository, recorded when switching
   * onto one of its linked worktrees.
   */
  readonly mainWorktreePath?: string

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
    this.conditionalVersion(10, {}, migrateGHEOwnerEndpoints)
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

/**
 * Migrate owners belonging to `.ghe.com` endpoints persisted in a legacy
 * format (using the `/api/v3` path or a trailing slash) to the canonical
 * endpoint format so that they keep matching the endpoints of accounts which
 * are migrated in the same way. See `getMigratedGHEEndpoint`.
 *
 * Since previous account endpoint migrations didn't migrate owners it's
 * possible for multiple owners to map to the same canonical endpoint and
 * login. In that case we keep the most recently created owner and merge the
 * GitHub repositories of the others into it.
 */
async function migrateGHEOwnerEndpoints(tx: Transaction) {
  const ownersTable = tx.table<IDatabaseOwner, number>('owners')
  const allOwners = await ownersTable.toArray()

  const ownersByKey = new Map<string, Array<IDatabaseOwner>>()

  for (const owner of allOwners) {
    if (!isGHE(owner.endpoint)) {
      continue
    }

    const endpoint = getMigratedGHEEndpoint(owner.endpoint) ?? owner.endpoint
    const key = getOwnerKey(endpoint, owner.login)
    const owners = ownersByKey.get(key) ?? []
    ownersByKey.set(key, [...owners, owner])
  }

  const ownersToUpdate = new Array<IDatabaseOwner>()
  const ownersToDelete = new Array<number>()

  for (const [key, owners] of ownersByKey) {
    const [owner, ...duplicates] = owners.toSorted(
      (x, y) => (y.id ?? 0) - (x.id ?? 0)
    )
    assertNonNullable(owner.id, 'Missing owner id')

    for (const duplicate of duplicates) {
      assertNonNullable(duplicate.id, 'Missing duplicate owner id')
      log.info(
        `migrateGHEOwnerEndpoints: Merging owner ${duplicate.id} into ${owner.id}`
      )
      await mergeOwnerGitHubRepositories(tx, duplicate.id, owner.id)
      ownersToDelete.push(duplicate.id)
    }

    const endpoint = getMigratedGHEEndpoint(owner.endpoint) ?? owner.endpoint

    if (owner.endpoint !== endpoint || owner.key !== key) {
      ownersToUpdate.push({ ...owner, endpoint, key })
    }
  }

  log.info(
    `migrateGHEOwnerEndpoints: Updating ${ownersToUpdate.length} owners, deleting ${ownersToDelete.length} duplicates`
  )

  // Delete duplicates first in order to not violate the uniqueness constraint
  // of the key index when updating the remaining owners.
  await ownersTable.bulkDelete(ownersToDelete)
  await ownersTable.bulkPut(ownersToUpdate)
}

/**
 * Move all GitHub repositories belonging to one owner to another owner. If
 * the target owner already has a GitHub repository with the same name the
 * source repository is deleted and any references to it are updated to point
 * to the target repository.
 */
async function mergeOwnerGitHubRepositories(
  tx: Transaction,
  fromOwnerID: number,
  toOwnerID: number
) {
  const reposTable = tx.table<IDatabaseRepository, number>('repositories')
  const ghReposTable = tx.table<IDatabaseGitHubRepository, number>(
    'gitHubRepositories'
  )
  const protectedBranchesTable = tx.table<IDatabaseProtectedBranch, BranchKey>(
    'protectedBranches'
  )

  const ghRepos = await ghReposTable
    .where('[ownerID+name]')
    .between([fromOwnerID], [fromOwnerID + 1])
    .toArray()

  for (const ghRepo of ghRepos) {
    const fromID = ghRepo.id
    assertNonNullable(fromID, 'Missing GitHub repository id')

    const existing = await ghReposTable
      .where('[ownerID+name]')
      .equals([toOwnerID, ghRepo.name])
      .first()

    if (existing === undefined) {
      await ghReposTable.update(fromID, { ownerID: toOwnerID })
      continue
    }

    const toID = existing.id
    assertNonNullable(toID, 'Missing existing GitHub repository id')

    await reposTable
      .filter(r => r.gitHubRepositoryID === fromID)
      .modify({ gitHubRepositoryID: toID })
    await ghReposTable
      .filter(r => r.parentID === fromID)
      .modify({ parentID: toID })
    await protectedBranchesTable.where('repoId').equals(fromID).delete()
    await ghReposTable.delete(fromID)
  }
}

/* Creates a case-insensitive key used to uniquely identify an owner
 * based on the endpoint and login. Note that the key happens to
 * match the canonical API url for the user. This has no practical
 * purpose but can make debugging a little bit easier.
 */
export function getOwnerKey(endpoint: string, login: string) {
  return `${endpoint}/users/${login}`.toLowerCase()
}
