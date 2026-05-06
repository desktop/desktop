import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
  IDatabaseOwner,
  IDatabaseRepository,
  getOwnerKey,
} from '../../src/lib/databases'

describe('RepositoriesDatabase', () => {
  it('migrates from version 2 to 4 by deleting duplicate GitHub repositories', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 2)
    await db.delete()
    await db.open()

    const gitHubRepo: IDatabaseGitHubRepository = {
      ownerID: 1,
      name: 'desktop',
      private: false,
      htmlURL: 'http://github.com/desktop/desktop',
      cloneURL: 'http://github.com/desktop/desktop.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }
    const originalId = await db.gitHubRepositories.add({ ...gitHubRepo })
    const duplicateId = await db.gitHubRepositories.add({ ...gitHubRepo })
    db.close()

    db = new RepositoriesDatabase(dbName, 4)
    await db.open()

    const original = await db.gitHubRepositories.get(originalId)
    assert(original !== undefined)

    const dupe = await db.gitHubRepositories.get(duplicateId)
    assert(dupe === undefined)

    await db.delete()
  })

  it('migrates from version 8 to 9 by deleting duplicate owners', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 8)
    await db.delete()
    await db.open()

    type OwnersModelBeforeUpgrade = Omit<IDatabaseOwner, 'key'>
    const ownersTableBeforeUpgrade = db.table<OwnersModelBeforeUpgrade, number>(
      'owners'
    )
    const endpoint = 'A'

    const ownerA = await ownersTableBeforeUpgrade.add({
      endpoint,
      login: 'desktop',
    })
    const ownerB = await ownersTableBeforeUpgrade.add({
      endpoint,
      login: 'DeskTop',
    })

    const originalRepoA: IDatabaseGitHubRepository = {
      ownerID: ownerA,
      name: 'desktop',
      private: false,
      htmlURL: 'http://github.com/desktop/desktop',
      cloneURL: 'http://github.com/desktop/desktop.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }
    const originalRepoB: IDatabaseGitHubRepository = {
      ownerID: ownerB,
      name: 'dugite',
      private: false,
      htmlURL: 'http://github.com/desktop/dugite',
      cloneURL: 'http://github.com/desktop/dugite.git',
      parentID: null,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    }

    const repoAId = await db.gitHubRepositories.add(originalRepoA)
    const repoBId = await db.gitHubRepositories.add(originalRepoB)

    assert.equal(await db.gitHubRepositories.count(), 2)
    assert.equal(await db.owners.count(), 2)

    db.close()

    db = new RepositoriesDatabase(dbName, 9)
    await db.open()

    assert.equal(await db.gitHubRepositories.count(), 2)
    assert.equal(await db.owners.count(), 1)

    const migratedRepoA = await db.gitHubRepositories.get(repoAId)
    assert.deepStrictEqual(migratedRepoA, originalRepoA)

    const migratedRepoB = await db.gitHubRepositories.get(repoBId)
    assert.notDeepStrictEqual(migratedRepoB, originalRepoB)

    const migratedOwner = await db.owners.toCollection().first()

    assert(migratedOwner !== undefined)
    assert.deepStrictEqual(migratedRepoA?.ownerID, migratedOwner?.id)
    assert.deepStrictEqual(migratedOwner?.endpoint, endpoint)
    assert.deepStrictEqual(migratedOwner?.key, getOwnerKey(endpoint, 'DeskTop'))

    await db.delete()
  })

  it('migrates from version 9 to 10 by adding the favouriteGroups table', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 9)
    await db.delete()
    await db.open()

    type RepoModelV9 = Omit<IDatabaseRepository, 'favouriteGroupId'>
    const v9ReposTable = db.table<RepoModelV9, number>('repositories')

    const repoId = await v9ReposTable.add({
      gitHubRepositoryID: null,
      path: '/path/legacy',
      alias: null,
      missing: false,
    })

    db.close()

    db = new RepositoriesDatabase(dbName, 10)
    await db.open()

    const migrated = await db.repositories.get(repoId)
    assert(migrated !== undefined)
    assert.equal(migrated.favouriteGroupId, undefined)

    const groups = await db.favouriteGroups.toArray()
    assert.equal(groups.length, 0)

    await db.delete()
  })

  it('preserves an existing favouriteGroupId across re-opens at v10', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 10)
    await db.delete()
    await db.open()

    const groupId = await db.favouriteGroups.add({
      name: 'Existing',
      sortOrder: 0,
    })
    const repoId = await db.repositories.add({
      gitHubRepositoryID: null,
      path: '/path/already-pinned',
      alias: null,
      missing: false,
      favouriteGroupId: groupId,
    })

    db.close()

    db = new RepositoriesDatabase(dbName, 10)
    await db.open()

    const migrated = await db.repositories.get(repoId)
    assert(migrated !== undefined)
    assert.equal(migrated.favouriteGroupId, groupId)

    const groups = await db.favouriteGroups.toArray()
    assert.equal(groups.length, 1)
    assert.equal(groups[0].name, 'Existing')

    await db.delete()
  })
})
