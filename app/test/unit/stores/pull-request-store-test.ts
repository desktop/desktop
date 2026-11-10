import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PullRequestStore } from '../../../src/lib/stores/pull-request-store'
import { RepositoriesStore } from '../../../src/lib/stores'
import { IPullRequest } from '../../../src/lib/databases'
import {
  TestPullRequestDatabase,
  TestRepositoriesDatabase,
} from '../../helpers/databases'
import { createMockAPIRepository } from '../../helpers/mock-api'

describe('PullRequestStore', () => {
  describe('getAll', () => {
    it('clears cached pull requests referencing missing repositories', async t => {
      const repositoriesDb = new TestRepositoriesDatabase()
      const pullRequestDb = new TestPullRequestDatabase()
      await repositoriesDb.reset()
      await pullRequestDb.reset()
      t.after(async () => {
        await repositoriesDb.delete()
        await pullRequestDb.delete()
      })

      const repositoriesStore = new RepositoriesStore(repositoriesDb)
      const store = new PullRequestStore(pullRequestDb, repositoriesStore)
      const repository = await repositoriesStore.upsertGitHubRepository(
        'https://api.github.com',
        { ...createMockAPIRepository(), parent: undefined }
      )
      const missingRepoId = repository.dbID + 1000

      const pullRequest = (
        prNumber: number,
        headRepoId: number
      ): IPullRequest => ({
        number: prNumber,
        title: `PR ${prNumber}`,
        body: '',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:00:00Z',
        head: { repoId: headRepoId, ref: 'feature', sha: 'abc' },
        base: { repoId: repository.dbID, ref: 'main', sha: 'def' },
        author: 'monalisa',
        draft: false,
      })

      await pullRequestDb.putPullRequests([
        pullRequest(1, repository.dbID),
        pullRequest(2, missingRepoId),
      ])
      await pullRequestDb.setLastUpdated(repository, new Date())

      assert.deepStrictEqual(await store.getAll(repository), [])
      assert.deepStrictEqual(
        await pullRequestDb.getAllPullRequestsInRepository(repository),
        []
      )
      assert.equal(await pullRequestDb.getLastUpdated(repository), null)
    })
  })
})
