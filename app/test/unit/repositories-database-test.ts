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

  it('migrates from version 9 to 10 by defaulting isFavourite to false', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 9)
    await db.delete()
    await db.open()

    type RepoModelBeforeUpgrade = Omit<
      IDatabaseRepository,
      'isFavourite' | 'favouriteGroupId'
    >
    const repositoriesTable = db.table<RepoModelBeforeUpgrade, number>(
      'repositories'
    )

    const repoId = await repositoriesTable.add({
      gitHubRepositoryID: null,
      path: '/some/path',
      alias: null,
      missing: false,
    })

    db.close()

    db = new RepositoriesDatabase(dbName, 10)
    await db.open()

    const migrated = await db.repositories.get(repoId)
    assert(migrated !== undefined)
    assert.equal(migrated.isFavourite, false)

    await db.delete()
  })

  it('migrates from version 10 to 11 by moving favourites into a default group', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 10)
    await db.delete()
    await db.open()

    type RepoModelV10 = Omit<IDatabaseRepository, 'favouriteGroupId'>
    const v10ReposTable = db.table<RepoModelV10, number>('repositories')

    const favId = await v10ReposTable.add({
      gitHubRepositoryID: null,
      path: '/path/fav',
      alias: null,
      missing: false,
      isFavourite: true,
    })
    const plainId = await v10ReposTable.add({
      gitHubRepositoryID: null,
      path: '/path/plain',
      alias: null,
      missing: false,
      isFavourite: false,
    })

    db.close()

    db = new RepositoriesDatabase(dbName, 11)
    await db.open()

    const groups = await db.favouriteGroups.toArray()
    assert.equal(groups.length, 1)
    assert.equal(groups[0].name, 'Favourites')

    const fav = await db.repositories.get(favId)
    const plain = await db.repositories.get(plainId)
    assert(fav !== undefined && plain !== undefined)
    assert.equal(fav.favouriteGroupId, groups[0].id)
    assert.equal(plain.favouriteGroupId, null)

    await db.delete()
  })

  it('does not create a default group when no v10 favourites exist', async () => {
    const dbName = 'TestRepositoriesDatabase'
    let db = new RepositoriesDatabase(dbName, 10)
    await db.delete()
    await db.open()

    type RepoModelV10 = Omit<IDatabaseRepository, 'favouriteGroupId'>
    const v10ReposTable = db.table<RepoModelV10, number>('repositories')

    await v10ReposTable.add({
      gitHubRepositoryID: null,
      path: '/path/plain',
      alias: null,
      missing: false,
      isFavourite: false,
    })

    db.close()

    db = new RepositoriesDatabase(dbName, 11)
    await db.open()

    const groups = await db.favouriteGroups.toArray()
    assert.equal(groups.length, 0)

    await db.delete()
  })
})
