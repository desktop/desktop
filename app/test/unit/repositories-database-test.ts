import {
  RepositoriesDatabase,
  IDatabaseGitHubRepository,
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
      defaultBranch: 'master',
      cloneURL: 'http://github.com/desktop/desktop.git',
      parentID: null,
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
})
