import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { createMockAPIRepository } from '../helpers/mock-api'

describe('tutorial repository account assignment', () => {
  const endpoint = 'https://api.github.com'
  const path = '/tutorial-repository'
  const apiRepository = {
    ...createMockAPIRepository({ name: 'desktop-tutorial' }),
    parent: undefined,
    permissions: { pull: true, push: true, admin: true },
  }
  let database: TestRepositoriesDatabase
  let store: RepositoriesStore

  beforeEach(async () => {
    database = new TestRepositoriesDatabase()
    await database.reset()
    store = new RepositoriesStore(database)
  })
  afterEach(() => database.close())

  it('persists the selected login and its fetched metadata together', async () => {
    await store.addTutorialRepository(
      path,
      endpoint,
      apiRepository,
      `${path}/.git`,
      'bob'
    )

    const [repository] = await store.getAll()
    assert.strictEqual(repository.login, 'bob')
    assert.strictEqual(repository.isTutorialRepository, true)
    assert.strictEqual(repository.gitDir, `${path}/.git`)
    assert.strictEqual(repository.gitHubRepository?.permissions, 'admin')
    const metadata = await database.gitHubRepositories.get(
      repository.gitHubRepository?.dbID ?? -1
    )
    assert.strictEqual(metadata?.accountLogin, 'bob')

    const rebound = await store.updateRepositoryAccount(repository, 'bob')
    assert.strictEqual(
      rebound.gitHubRepository?.dbID,
      repository.gitHubRepository?.dbID
    )
    assert.strictEqual(rebound.gitHubRepository?.permissions, 'admin')
  })

  it('keeps the optional account argument backwards compatible', async () => {
    await store.addTutorialRepository(path, endpoint, apiRepository)
    const [repository] = await store.getAll()
    assert.strictEqual(repository.login, null)
    assert.strictEqual(repository.isTutorialRepository, true)
  })

  for (const login of [null, 'alice']) {
    it(`preserves an existing ${
      login ?? 'unassigned'
    } repository and its metadata`, async () => {
      const githubRepository = await store.upsertGitHubRepository(
        endpoint,
        {
          ...createMockAPIRepository({ name: 'existing' }),
          parent: undefined,
          permissions: { pull: true, push: false, admin: false },
        },
        login ?? ''
      )
      const associated = await store.setGitHubRepository(
        await store.addRepository(path, `${path}/.git`),
        githubRepository
      )
      const assigned = await store.updateRepositoryAccount(associated, login)
      await store.updateRepositoryAlias(assigned, 'My repository')
      const [existing] = await store.getAll()

      await store.addTutorialRepository(
        path,
        'https://different.example/api/v3',
        apiRepository,
        `${path}/other.git`,
        'bob'
      )

      const [repository] = await store.getAll()
      assert.strictEqual(repository.id, existing.id)
      assert.strictEqual(repository.login, login)
      assert.strictEqual(repository.alias, 'My repository')
      assert.strictEqual(repository.gitDir, `${path}/.git`)
      assert.strictEqual(repository.isTutorialRepository, true)
      assert.strictEqual(
        repository.gitHubRepository?.dbID,
        existing.gitHubRepository?.dbID
      )
      assert.strictEqual(
        repository.gitHubRepository?.permissions,
        existing.gitHubRepository?.permissions
      )
      assert.strictEqual(
        (await database.gitHubRepositories.toArray()).some(
          metadata => metadata.accountLogin === 'bob'
        ),
        false
      )
    })
  }
})
