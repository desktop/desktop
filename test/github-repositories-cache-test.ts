import * as chai from 'chai'
const expect = chai.expect

import GitHubRepository from '../src/models/github-repository'
import Owner from '../src/models/owner'
import GitHubRepositoriesCache from '../src/shared-process/github-repositories-cache'
import TestDatabase from './test-database'

describe('GitHubRepositoriesCache', () => {
  let cache: GitHubRepositoriesCache = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    cache = new GitHubRepositoriesCache(db)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoName = 'oh-say-can-you-sql'
      const owner = new Owner('galinda', '')
      const repo = new GitHubRepository(repoName, owner, '123', `https://github.com/${owner.getLogin()}/${repoName}.git`, `git@github.com:${owner.getLogin()}/${repoName}.git`, `git@github.com:${owner.getLogin()}/${repoName}.git`, `https://github.com/${owner.getLogin()}/${repoName}`)
      await cache.addRepository(repo)

      const repositories = await cache.getRepositories()
      expect(repositories[0].getName()).to.equal(repoName)
    })
  })
})
