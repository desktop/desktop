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

  describe('setRepositoryCollection', () => {
    it('assigns a repository to a folder and persists collectionDisplayOrder', async () => {
      const repo = await repositoriesStore.addRepository('/cool/path')
      await repositoriesStore.setRepositoryCollection(repo, 42, 0)

      const all = await repoDb.repositories.toArray()
      assert.equal(all[0].collectionId, 42)
      assert.equal(all[0].collectionDisplayOrder, 0)
    })

    it('clears folder assignment when collectionId is null', async () => {
      const repo = await repositoriesStore.addRepository('/cool/path')
      await repositoriesStore.setRepositoryCollection(repo, 42, 0)
      await repositoriesStore.setRepositoryCollection(repo, null, null)

      const all = await repoDb.repositories.toArray()
      assert.equal(all[0].collectionId ?? null, null)
    })
  })

  describe('getRepositoryCollectionState', () => {
    it('returns the raw collectionId and collectionDisplayOrder', async () => {
      const repo = await repositoriesStore.addRepository('/cool/path')
      await repositoriesStore.setRepositoryCollection(repo, 7, 3)

      const state = await repositoriesStore.getRepositoryCollectionState(
        repo.id
      )
      assert.equal(state.collectionId, 7)
      assert.equal(state.collectionDisplayOrder, 3)
    })
  })

  describe('getAllRepositoryCollectionStates', () => {
    it('returns a map of repoId -> {collectionId, collectionDisplayOrder}', async () => {
      const a = await repositoriesStore.addRepository('/a')
      const b = await repositoriesStore.addRepository('/b')
      await repositoriesStore.setRepositoryCollection(a, 1, 0)
      await repositoriesStore.setRepositoryCollection(b, 1, 1)

      const map = await repositoriesStore.getAllRepositoryCollectionStates()
      assert.equal(map.get(a.id)?.collectionId, 1)
      assert.equal(map.get(b.id)?.collectionId, 1)
    })
  })

  describe('clearCollectionForRepositoriesIn', () => {
    it('sets collectionId to null for all repos in a given folder', async () => {
      const a = await repositoriesStore.addRepository('/a')
      const b = await repositoriesStore.addRepository('/b')
      const c = await repositoriesStore.addRepository('/c')
      await repositoriesStore.setRepositoryCollection(a, 5, 0)
      await repositoriesStore.setRepositoryCollection(b, 5, 1)
      await repositoriesStore.setRepositoryCollection(c, 6, 0)

      await repositoriesStore.clearCollectionForRepositoriesIn(5)

      const map = await repositoriesStore.getAllRepositoryCollectionStates()
      assert.equal(map.get(a.id)?.collectionId ?? null, null)
      assert.equal(map.get(b.id)?.collectionId ?? null, null)
      assert.equal(map.get(c.id)?.collectionId, 6)
    })
  })
})
