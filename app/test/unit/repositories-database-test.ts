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
    expect(original).not.toBeUndefined()

    const dupe = await db.gitHubRepositories.get(duplicateId)
    expect(dupe).toBeUndefined()

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

    expect(await db.gitHubRepositories.count()).toEqual(2)
    expect(await db.owners.count()).toEqual(2)

    db.close()

    db = new RepositoriesDatabase(dbName, 9)
    await db.open()

    expect(await db.gitHubRepositories.count()).toEqual(2)
    expect(await db.owners.count()).toEqual(1)

    const migratedRepoA = await db.gitHubRepositories.get(repoAId)
    expect(migratedRepoA).toEqual(originalRepoA)

    const migratedRepoB = await db.gitHubRepositories.get(repoBId)
    expect(migratedRepoB).not.toEqual(originalRepoB)

    const migratedOwner = await db.owners.toCollection().first()

    expect(migratedOwner).not.toBeUndefined()
    expect(migratedRepoA?.ownerID).toEqual(migratedOwner?.id)
    expect(migratedOwner?.endpoint).toEqual(endpoint)
    expect(migratedOwner?.key).toEqual(getOwnerKey(endpoint, 'DeskTop'))

    await db.delete()
  })
})
