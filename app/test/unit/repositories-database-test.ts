import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
  IDatabaseOwner,
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

  describe('migrating from version 9 to 10', () => {
    const dbName = 'TestRepositoriesDatabaseGHEOwners'
    const canonical = 'https://api.whatever.ghe.com'

    const ghRepo = (
      ownerID: number,
      name: string,
      parentID: number | null = null
    ): IDatabaseGitHubRepository => ({
      ownerID,
      name,
      private: false,
      htmlURL: `https://whatever.ghe.com/desktop/${name}`,
      cloneURL: `https://whatever.ghe.com/desktop/${name}.git`,
      parentID,
      lastPruneDate: null,
      permissions: 'write',
      issuesEnabled: true,
    })

    const addOwner = (
      db: RepositoriesDatabase,
      endpoint: string,
      login: string
    ) => db.owners.add({ endpoint, login, key: getOwnerKey(endpoint, login) })

    it('migrates .ghe.com owners to the canonical endpoint', async () => {
      let db = new RepositoriesDatabase(dbName, 9)
      await db.delete()
      await db.open()

      const slashOwner = await addOwner(db, `${canonical}/`, 'desktop')
      const ghesOwner = await addOwner(
        db,
        'https://ghes.example.com/api/v3',
        'desktop'
      )
      const dotcomOwner = await addOwner(
        db,
        'https://api.github.com',
        'desktop'
      )
      db.close()

      db = new RepositoriesDatabase(dbName, 10)
      await db.open()

      assert.equal(await db.owners.count(), 3)

      const migrated = await db.owners.get(slashOwner)
      assert.equal(migrated?.endpoint, canonical)
      assert.equal(migrated?.key, getOwnerKey(canonical, 'desktop'))
      assert.equal(migrated?.login, 'desktop')

      const ghes = await db.owners.get(ghesOwner)
      assert.equal(ghes?.endpoint, 'https://ghes.example.com/api/v3')

      const dotcom = await db.owners.get(dotcomOwner)
      assert.equal(dotcom?.endpoint, 'https://api.github.com')

      await db.delete()
    })

    it('merges duplicate .ghe.com owners and their repositories', async () => {
      let db = new RepositoriesDatabase(dbName, 9)
      await db.delete()
      await db.open()

      // Left behind by the previous /api/v3 -> api. account migration
      const oldOwner = await addOwner(
        db,
        'https://whatever.ghe.com/api/v3',
        'desktop'
      )
      const newOwner = await addOwner(db, `${canonical}/`, 'Desktop')

      const oldShared = await db.gitHubRepositories.add(
        ghRepo(oldOwner, 'shared')
      )
      const oldOnly = await db.gitHubRepositories.add(
        ghRepo(oldOwner, 'old-only')
      )
      const oldFork = await db.gitHubRepositories.add(
        ghRepo(oldOwner, 'fork', oldShared)
      )
      const newShared = await db.gitHubRepositories.add(
        ghRepo(newOwner, 'shared')
      )

      await db.protectedBranches.bulkAdd([
        { repoId: oldShared, name: 'main' },
        { repoId: newShared, name: 'main' },
      ])

      const localRepo = await db.repositories.add({
        path: '/tmp/shared',
        alias: null,
        gitHubRepositoryID: oldShared,
        missing: false,
      })
      db.close()

      db = new RepositoriesDatabase(dbName, 10)
      await db.open()

      const owners = await db.owners.toArray()
      assert.equal(owners.length, 1)
      assert.equal(owners[0].id, newOwner)
      assert.equal(owners[0].endpoint, canonical)
      assert.equal(owners[0].login, 'Desktop')
      assert.equal(owners[0].key, getOwnerKey(canonical, 'desktop'))

      assert.equal(await db.gitHubRepositories.get(oldShared), undefined)
      assert.equal(
        (await db.gitHubRepositories.get(newShared))?.ownerID,
        newOwner
      )
      assert.equal(
        (await db.gitHubRepositories.get(oldOnly))?.ownerID,
        newOwner
      )

      const fork = await db.gitHubRepositories.get(oldFork)
      assert.equal(fork?.ownerID, newOwner)
      assert.equal(fork?.parentID, newShared)

      assert.equal(
        (await db.repositories.get(localRepo))?.gitHubRepositoryID,
        newShared
      )

      const protectedBranches = await db.protectedBranches.toArray()
      assert.deepStrictEqual(protectedBranches, [
        { repoId: newShared, name: 'main' },
      ])

      await db.delete()
    })
  })
})
