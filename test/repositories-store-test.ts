import * as chai from 'chai'
const expect = chai.expect

import Repository from '../src/models/repository'
import RepositoriesStore from '../src/shared-process/repositories-store'
import TestDatabase from './test-database'

describe('RepositoriesStore', () => {
  let repositoriesStore: RepositoriesStore = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    repositoriesStore = new RepositoriesStore(db)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore.addRepository(new Repository(repoPath, null))

      const repositories = await repositoriesStore.getRepositories()
      expect(repositories[0].getPath()).to.equal(repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore.addRepository(new Repository('/some/cool/path', null))
      await repositoriesStore.addRepository(new Repository('/some/other/path', null))

      const repositories = await repositoriesStore.getRepositories()
      expect(repositories.length).to.equal(2)
    })
  })
})
