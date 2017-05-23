import * as chai from 'chai'
const expect = chai.expect

import { RepositoriesStore } from '../../src/shared-process/repositories-store'
import { TestDatabase } from '../test-database'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

describe('RepositoriesStore', () => {
  let repositoriesStore: RepositoriesStore | null = null

  beforeEach(async () => {
    const db = new TestDatabase()
    await db.reset()

    repositoriesStore = new RepositoriesStore(db)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore!.addRepository(repoPath)

      const repositories = await repositoriesStore!.getRepositories()
      expect(repositories[0].path).to.equal(repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore!.addRepository('/some/cool/path')
      await repositoriesStore!.addRepository('/some/other/path')

      const repositories = await repositoriesStore!.getRepositories()
      expect(repositories.length).to.equal(2)
    })
  })

  describe('updating a GitHub repository', () => {
    it('adds a new GitHub repository', async () => {
      const addedRepo = await repositoriesStore!.addRepository('/some/cool/path')

      const gitHubRepo = new GitHubRepository('my-repo', new Owner('my-user', 'https://api.github.com'), 1, true, false, 'https://github.com/my-user/my-repo')
      const repoWithGitHub = addedRepo.withGitHubRepository(gitHubRepo)
      await repositoriesStore!.updateGitHubRepository(repoWithGitHub)

      const repositories = await repositoriesStore!.getRepositories()
      const repo = repositories[0]
      expect(repo.gitHubRepository!.private).to.equal(true)
      expect(repo.gitHubRepository!.fork).to.equal(false)
      expect(repo.gitHubRepository!.htmlURL).to.equal('https://github.com/my-user/my-repo')
    })

    it('updates an existing GitHub repository', async () => {
      const addedRepo = await repositoriesStore!.addRepository('/some/cool/path')

      const gitHubRepo = new GitHubRepository('my-repo', new Owner('my-user', 'https://api.github.com'), 1, true, false, 'https://github.com/my-user/my-repo', 'dev')
      const repoWithGitHub = addedRepo.withGitHubRepository(gitHubRepo)
      await repositoriesStore!.updateGitHubRepository(repoWithGitHub)

      const repositories = await repositoriesStore!.getRepositories()
      const repo = repositories[0]
      expect(repo.gitHubRepository!.private).to.equal(true)
      expect(repo.gitHubRepository!.fork).to.equal(false)
      expect(repo.gitHubRepository!.defaultBranch).to.equal('dev')
      expect(repo.gitHubRepository!.htmlURL).to.equal('https://github.com/my-user/my-repo')
    })
  })
})
