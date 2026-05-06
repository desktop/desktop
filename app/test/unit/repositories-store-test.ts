import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IAPIFullRepository, getDotComAPIEndpoint } from '../../src/lib/api'
import { assertIsRepositoryWithGitHubRepository } from '../../src/models/repository'

describe('RepositoriesStore', () => {
  let repoDb = new TestRepositoriesDatabase()
  let repositoriesStore = new RepositoriesStore(repoDb)

  beforeEach(async () => {
    repoDb = new TestRepositoriesDatabase()
    await repoDb.reset()
    repositoriesStore = new RepositoriesStore(repoDb)
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore.addRepository(repoPath)

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories[0].path, repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore.addRepository('/some/cool/path')
      await repositoriesStore.addRepository('/some/other/path')

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories.length, 2)
    })
  })

  describe('updating a GitHub repository', () => {
    const apiRepo: IAPIFullRepository = {
      clone_url: 'https://github.com/my-user/my-repo',
      ssh_url: 'git@github.com:my-user/my-repo.git',
      html_url: 'https://github.com/my-user/my-repo',
      name: 'my-repo',
      owner: {
        id: 42,
        html_url: 'https://github.com/my-user',
        login: 'my-user',
        avatar_url: 'https://github.com/my-user.png',
        type: 'User',
      },
      private: true,
      fork: false,
      default_branch: 'master',
      pushed_at: '1995-12-17T03:24:00',
      has_issues: true,
      archived: false,
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
      parent: undefined,
    }
    const endpoint = getDotComAPIEndpoint()

    it('adds a new GitHub repository', async () => {
      await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository('/some/cool/path'),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      const repositories = await repositoriesStore.getAll()
      const repo = repositories[0]
      assertIsRepositoryWithGitHubRepository(repo)
      assert(repo.gitHubRepository.isPrivate)
      assert(!repo.gitHubRepository.fork)
      assert.equal(
        repo.gitHubRepository.htmlURL,
        'https://github.com/my-user/my-repo'
      )
    })

    it('reuses an existing GitHub repository', async () => {
      const firstRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository('/some/cool/path'),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      const secondRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository('/some/other/path'),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      assert.equal(
        firstRepo.gitHubRepository.dbID,
        secondRepo.gitHubRepository.dbID
      )
    })
  })

  describe('favourites and groups', () => {
    it('defaults favouriteGroupId to null on new repositories', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      assert.equal(repo.favouriteGroupId, null)
      assert.equal(repo.isFavourite, false)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favouriteGroupId, null)
    })

    it('creates a group and assigns a repository to it', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavouriteGroup('Work')
      assert.equal(group.name, 'Work')

      const updated = await repositoriesStore.setRepositoryFavouriteGroup(
        repo,
        group.id
      )
      assert.equal(updated.favouriteGroupId, group.id)
      assert.equal(updated.isFavourite, true)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favouriteGroupId, group.id)
    })

    it('removes membership when groupId is null', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavouriteGroup('Work')
      await repositoriesStore.setRepositoryFavouriteGroup(repo, group.id)
      const cleared = await repositoriesStore.setRepositoryFavouriteGroup(
        repo,
        null
      )
      assert.equal(cleared.favouriteGroupId, null)
      assert.equal(cleared.isFavourite, false)
    })

    it('renames a group', async () => {
      const group = await repositoriesStore.addFavouriteGroup('Work')
      await repositoriesStore.renameFavouriteGroup(group.id, 'Job')
      const groups = await repositoriesStore.getAllFavouriteGroups()
      assert.equal(groups.length, 1)
      assert.equal(groups[0].name, 'Job')
    })

    it('clears member memberships when a group is deleted', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavouriteGroup('Work')
      await repositoriesStore.setRepositoryFavouriteGroup(repo, group.id)

      await repositoriesStore.removeFavouriteGroup(group.id)

      const groups = await repositoriesStore.getAllFavouriteGroups()
      assert.equal(groups.length, 0)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favouriteGroupId, null)
      assert.equal(repos[0].isFavourite, false)
    })

    it('orders groups by sortOrder ascending', async () => {
      const a = await repositoriesStore.addFavouriteGroup('A')
      const b = await repositoriesStore.addFavouriteGroup('B')
      const c = await repositoriesStore.addFavouriteGroup('C')
      const groups = await repositoriesStore.getAllFavouriteGroups()
      assert.deepEqual(
        groups.map(g => g.id),
        [a.id, b.id, c.id]
      )
    })
  })
})
