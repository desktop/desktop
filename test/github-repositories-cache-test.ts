import * as chai from 'chai'
const expect = chai.expect

import GitHubRepository from '../src/models/github-repository'
import Owner from '../src/models/owner'
import GitHubRepositoriesCache from '../src/shared-process/github-repositories-cache'
import TestDatabase from './test-database'

describe('GitHubRepositoriesCache', () => {
  const repoName = 'oh-say-can-you-sql'
  const ownerName = 'galinda'

  let cache: GitHubRepositoriesCache = null
  let repo: GitHubRepository = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    cache = new GitHubRepositoriesCache(db)

    const owner = new Owner(ownerName, '')
    repo = new GitHubRepository(repoName, owner, '123', `https://github.com/${ownerName}/${repoName}.git`, `git@github.com:${ownerName}/${repoName}.git`, `git@github.com:${ownerName}/${repoName}.git`, `https://github.com/${ownerName}/${repoName}`)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      await cache.addRepository(repo)

      const repositories = await cache.getRepositories()
      expect(repositories[0].name).to.equal(repoName)
    })

    it('can find the repository by an origin URL', async () => {
      await cache.addRepository(repo)

      let match = await cache.findRepositoryWithRemoteURL(`git@github.com:${ownerName}/${repoName}.git`)
      expect(match).not.to.equal(null)

      match = await cache.findRepositoryWithRemoteURL(`https://github.com/${ownerName}/${repoName}.git`)
      expect(match).not.to.equal(null)

      match = await cache.findRepositoryWithRemoteURL(`https://github.com/something/else.git`)
      expect(match).to.equal(null)
    })
  })
})
