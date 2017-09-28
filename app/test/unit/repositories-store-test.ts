import * as chai from 'chai'
const expect = chai.expect

import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../test-repositories-database'
import { IAPIRepository } from '../../src/lib/api'

describe('RepositoriesStore', () => {
  let repositoriesStore: RepositoriesStore | null = null

  beforeEach(async () => {
    const db = new TestRepositoriesDatabase()
    await db.reset()

    repositoriesStore = new RepositoriesStore(db)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore!.addRepository(repoPath)

      const repositories = await repositoriesStore!.getAll()
      expect(repositories[0].path).to.equal(repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore!.addRepository('/some/cool/path')
      await repositoriesStore!.addRepository('/some/other/path')

      const repositories = await repositoriesStore!.getAll()
      expect(repositories.length).to.equal(2)
    })
  })

  describe('updating a GitHub repository', () => {
    it('adds a new GitHub repository', async () => {
      const addedRepo = await repositoriesStore!.addRepository(
        '/some/cool/path'
      )

      const gitHubRepo: IAPIRepository = {
        clone_url: 'https://github.com/my-user/my-repo',
        html_url: 'https://github.com/my-user/my-repo',
        name: 'my-repo',
        owner: {
          id: 42,
          url: 'https://github.com/my-user',
          login: 'my-user',
          avatar_url: 'https://github.com/my-user.png',
          name: 'My User',
          type: 'User',
        },
        private: true,
        fork: false,
        default_branch: 'master',
        parent: null,
      }

      await repositoriesStore!.updateGitHubRepository(
        addedRepo,
        'https://api.github.com',
        gitHubRepo
      )

      const repositories = await repositoriesStore!.getAll()
      const repo = repositories[0]
      expect(repo.gitHubRepository!.private).to.equal(true)
      expect(repo.gitHubRepository!.fork).to.equal(false)
      expect(repo.gitHubRepository!.htmlURL).to.equal(
        'https://github.com/my-user/my-repo'
      )
    })
  })
})
