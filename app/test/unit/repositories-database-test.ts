import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
  IDatabaseOwner,
  getOwnerKey,
} from '../../src/lib/databases'

describe('RepositoriesDatabase', () => {
  for (const reopenLegacyBuild of [false, true]) {
    it(`preserves account-scoped data when upgrading ${
      reopenLegacyBuild ? 'after opening an older build' : 'from version 10'
    }`, async t => {
      const name = `AccountScopedRepositoriesRepair-${reopenLegacyBuild}`
      let db = new RepositoriesDatabase(name, 10)
      await db.delete()
      t.after(() => db.delete())
      await db.open()
      const ownerID = await db.owners.add({
        key: getOwnerKey('https://api.github.com', 'owner'),
        login: 'owner',
        endpoint: 'https://api.github.com',
        type: 'Organization',
      })
      const parentID = await db.gitHubRepositories.add({
        ownerID,
        name: 'parent',
        private: false,
        htmlURL: null,
        cloneURL: null,
        parentID: null,
        lastPruneDate: 12345,
        accountLogin: 'alice',
        permissions: 'read',
      })
      const id = await db.gitHubRepositories.add({
        ownerID,
        name: 'repo',
        private: true,
        htmlURL: 'https://github.com/owner/repo',
        cloneURL: 'https://github.com/owner/repo.git',
        parentID,
        lastPruneDate: 54321,
        accountLogin: 'alice',
        permissions: 'admin',
        issuesEnabled: true,
        isArchived: false,
      })
      await db.gitHubRepositories.add({
        ownerID,
        name: 'other',
        private: true,
        htmlURL: null,
        cloneURL: null,
        parentID: null,
        lastPruneDate: null,
        accountLogin: 'bob',
        permissions: 'write',
      })
      if (!reopenLegacyBuild) {
        const record = await db.gitHubRepositories.get(id)
        assert.ok(record)
        await db.gitHubRepositories.add({
          ...record,
          id: undefined,
          accountLogin: 'bob',
          permissions: 'read',
        })
      }
      const localID = await db.repositories.add({
        path: '/synthetic/repository',
        gitHubRepositoryID: id,
        missing: false,
        alias: 'Synthetic',
        gitDir: '/synthetic/repository/.git',
        login: 'alice',
        lastStashCheckDate: 12345,
      })
      await db.protectedBranches.add({ repoId: id, name: 'main' })
      const readRecords = async () => ({
        owners: await db.owners.toArray(),
        github: await db.gitHubRepositories.toArray(),
        local: await db.repositories.toArray(),
        protected: await db.protectedBranches.toArray(),
      })
      const before = await readRecords()
      const record = await db.gitHubRepositories.get(id)
      assert.ok(record)
      const secondAccount = {
        ...record,
        id: undefined,
        accountLogin: reopenLegacyBuild ? 'bob' : 'carol',
      }
      db.close()

      if (reopenLegacyBuild) {
        db = new RepositoriesDatabase(name, 9)
        await db.open()
        db.close()
        // Dexie's same-version schema patch leaves unexpected indexes in place.
        db = new RepositoriesDatabase(name, 10)
        await db.open()
        const contaminated = db
          .backendDB()
          .transaction('gitHubRepositories')
          .objectStore('gitHubRepositories')
        assert.strictEqual(contaminated.index('[ownerID+name]').unique, true)
        assert.strictEqual(
          contaminated.index('[ownerID+name+accountLogin]').unique,
          true
        )
        await assert.rejects(
          db.transaction('rw', db.gitHubRepositories, () =>
            db.gitHubRepositories.add(secondAccount)
          ),
          { name: 'ConstraintError' }
        )
        db.close()
      }

      db = new RepositoriesDatabase(name)
      await db.open()
      assert.deepStrictEqual(await readRecords(), before)
      assert.strictEqual(
        (await db.repositories.get(localID))?.gitHubRepositoryID,
        id
      )
      await db.gitHubRepositories.add(secondAccount)
      const repaired = db
        .backendDB()
        .transaction('gitHubRepositories')
        .objectStore('gitHubRepositories')
      assert.strictEqual(repaired.indexNames.contains('[ownerID+name]'), false)
      assert.strictEqual(
        repaired.index('[ownerID+name+accountLogin]').unique,
        true
      )
      await assert.rejects(
        db.transaction('rw', db.gitHubRepositories, () =>
          db.gitHubRepositories.add(secondAccount)
        ),
        { name: 'ConstraintError' }
      )
      const after = await readRecords()
      db.close()
      db = new RepositoriesDatabase(name)
      await db.open()
      assert.deepStrictEqual(await readRecords(), after)
    })
  }

  it('creates new databases with only account-scoped repository uniqueness', async t => {
    const db = new RepositoriesDatabase('NewAccountScopedRepositories')
    await db.delete()
    t.after(() => db.delete())
    await db.open()
    const table = db
      .backendDB()
      .transaction('gitHubRepositories')
      .objectStore('gitHubRepositories')
    assert.strictEqual(table.indexNames.contains('[ownerID+name]'), false)
    assert.strictEqual(table.index('[ownerID+name+accountLogin]').unique, true)
  })

  it('migrates legacy metadata to an unassigned scope without trusting old permissions', async t => {
    const name = 'AccountScopedRepositoriesMigration'
    let db = new RepositoriesDatabase(name, 9)
    await db.delete()
    await db.open()
    t.after(() => db.delete())
    const id = await db.gitHubRepositories.add({
      ownerID: 1,
      name: 'repo',
      private: false,
      htmlURL: null,
      cloneURL: null,
      parentID: null,
      lastPruneDate: null,
      permissions: 'admin',
    })
    await db.protectedBranches.add({ repoId: id, name: 'main' })
    db.close()
    db = new RepositoriesDatabase(name)
    await db.open()
    const record = await db.gitHubRepositories.get(id)
    assert.strictEqual(record?.accountLogin, '')
    assert.strictEqual(record?.permissions, null)
    assert.strictEqual(await db.protectedBranches.count(), 0)
    assert.ok(record)
    await db.gitHubRepositories.add({
      ...record,
      id: undefined,
      accountLogin: 'alice',
    })
    await db.gitHubRepositories.add({
      ...record,
      id: undefined,
      accountLogin: 'bob',
    })
    assert.strictEqual(await db.gitHubRepositories.count(), 3)
  })

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
})
