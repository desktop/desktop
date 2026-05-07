import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import {
  FavoriteGroupCapError,
  FavoriteGroupNameTakenError,
  MaxFavoriteTabs,
  RepositoriesStore,
  UnknownFavoriteGroupError,
} from '../../src/lib/stores/repositories-store'
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

  describe('favorites and groups', () => {
    it('defaults favoriteGroupId to null on new repositories', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      assert.equal(repo.favoriteGroupId, null)
      assert.equal(repo.isFavorite, false)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favoriteGroupId, null)
    })

    it('creates a group and assigns a repository to it', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavoriteGroup('Work')
      assert.equal(group.name, 'Work')

      const updated = await repositoriesStore.setRepositoryFavoriteGroup(
        repo,
        group.id
      )
      assert.equal(updated.favoriteGroupId, group.id)
      assert.equal(updated.isFavorite, true)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favoriteGroupId, group.id)
    })

    it('removes membership when groupId is null', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavoriteGroup('Work')
      await repositoriesStore.setRepositoryFavoriteGroup(repo, group.id)
      const cleared = await repositoriesStore.setRepositoryFavoriteGroup(
        repo,
        null
      )
      assert.equal(cleared.favoriteGroupId, null)
      assert.equal(cleared.isFavorite, false)
    })

    it('renames a group', async () => {
      const group = await repositoriesStore.addFavoriteGroup('Work')
      await repositoriesStore.renameFavoriteGroup(group.id, 'Job')
      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.equal(groups.length, 1)
      assert.equal(groups[0].name, 'Job')
    })

    it('clears member memberships when a group is deleted', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const group = await repositoriesStore.addFavoriteGroup('Work')
      await repositoriesStore.setRepositoryFavoriteGroup(repo, group.id)

      await repositoriesStore.removeFavoriteGroup(group.id)

      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.equal(groups.length, 0)

      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favoriteGroupId, null)
      assert.equal(repos[0].isFavorite, false)
    })

    it('orders groups by sortOrder ascending', async () => {
      const a = await repositoriesStore.addFavoriteGroup('A')
      const b = await repositoriesStore.addFavoriteGroup('B')
      const c = await repositoriesStore.addFavoriteGroup('C')
      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.deepEqual(
        groups.map(g => g.id),
        [a.id, b.id, c.id]
      )
    })

    it('moves a repository between groups', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      const work = await repositoriesStore.addFavoriteGroup('Work')
      const personal = await repositoriesStore.addFavoriteGroup('Personal')

      await repositoriesStore.setRepositoryFavoriteGroup(repo, work.id)
      const moved = await repositoriesStore.setRepositoryFavoriteGroup(
        repo,
        personal.id
      )

      assert.equal(moved.favoriteGroupId, personal.id)
      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favoriteGroupId, personal.id)
    })

    it('rejects creating a group beyond the cap', async () => {
      for (let i = 0; i < MaxFavoriteTabs; i++) {
        await repositoriesStore.addFavoriteGroup(`G${i}`)
      }
      await assert.rejects(
        repositoriesStore.addFavoriteGroup('one too many'),
        FavoriteGroupCapError
      )
      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.equal(groups.length, MaxFavoriteTabs)
    })

    it('rejects creating a group whose name only differs in case', async () => {
      await repositoriesStore.addFavoriteGroup('Work')
      await assert.rejects(
        repositoriesStore.addFavoriteGroup('WORK'),
        FavoriteGroupNameTakenError
      )
      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.equal(groups.length, 1)
    })

    it('rejects renaming a group onto another existing case-equivalent name', async () => {
      await repositoriesStore.addFavoriteGroup('Work')
      const personal = await repositoriesStore.addFavoriteGroup('Personal')
      await assert.rejects(
        repositoriesStore.renameFavoriteGroup(personal.id, 'work'),
        FavoriteGroupNameTakenError
      )
    })

    it('allows renaming a group to a different casing of its own name', async () => {
      const work = await repositoriesStore.addFavoriteGroup('Work')
      await repositoriesStore.renameFavoriteGroup(work.id, 'WORK')
      const groups = await repositoriesStore.getAllFavoriteGroups()
      assert.equal(groups[0].name, 'WORK')
    })

    it('rejects assigning a repository to a non-existent group', async () => {
      const repo = await repositoriesStore.addRepository('/path/a')
      await assert.rejects(
        repositoriesStore.setRepositoryFavoriteGroup(repo, 9999),
        UnknownFavoriteGroupError
      )
      const repos = await repositoriesStore.getAll()
      assert.equal(repos[0].favoriteGroupId, null)
    })
  })
})
