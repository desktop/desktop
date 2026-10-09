import assert from 'node:assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  getCommitMode,
  storeCommitMode,
} from '../../src/lib/stores/helpers/commit-mode-storage'
import { Repository } from '../../src/models/repository'
import { createTestRepositoryStateCache } from '../helpers/app-store-test-harness'

function createRepository(id: number) {
  return new Repository(`/repositories/${id}`, id, null, false)
}

describe('repository commit mode storage', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults to manual and keeps two repositories independent', () => {
    const first = createRepository(1)
    const second = createRepository(2)
    assert.strictEqual(getCommitMode(first), 'manual')
    assert.strictEqual(getCommitMode(second), 'manual')

    storeCommitMode(first, 'copilot')
    assert.strictEqual(getCommitMode(first), 'copilot')
    assert.strictEqual(getCommitMode(second), 'manual')

    storeCommitMode(second, 'copilot')
    storeCommitMode(first, 'manual')
    assert.strictEqual(getCommitMode(first), 'manual')
    assert.strictEqual(getCommitMode(second), 'copilot')
  })

  it('restores repository-specific preferences when the state cache is reconstructed', () => {
    const first = createRepository(1)
    const second = createRepository(2)
    storeCommitMode(first, 'copilot')

    const cache = createTestRepositoryStateCache()
    assert.strictEqual(cache.get(first).changesState.commitMode, 'copilot')
    assert.strictEqual(cache.get(second).changesState.commitMode, 'manual')

    const restartedCache = createTestRepositoryStateCache()
    assert.strictEqual(
      restartedCache.get(createRepository(1)).changesState.commitMode,
      'copilot'
    )
    assert.strictEqual(
      restartedCache.get(createRepository(2)).changesState.commitMode,
      'manual'
    )
  })

  it('uses the repository id so a renamed repository retains its preference', () => {
    storeCommitMode(createRepository(1), 'copilot')
    const renamed = new Repository('/renamed/repository', 1, null, false)
    assert.strictEqual(getCommitMode(renamed), 'copilot')
  })

  it('keeps the latest preference when returning to an already-cached alias identity', () => {
    const repository = createRepository(1)
    const alias = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'Alias'
    )
    const other = createRepository(2)
    const cache = createTestRepositoryStateCache()

    storeCommitMode(repository, 'copilot')
    cache.updateChangesState(repository, () => ({ commitMode: 'copilot' }))
    assert.strictEqual(cache.get(alias).changesState.commitMode, 'copilot')
    cache.get(other)

    storeCommitMode(alias, 'manual')
    cache.updateChangesState(alias, () => ({ commitMode: 'manual' }))
    assert.strictEqual(cache.get(repository).changesState.commitMode, 'manual')
    assert.strictEqual(getCommitMode(repository), 'manual')
    assert.strictEqual(cache.get(other).changesState.commitMode, 'manual')

    cache.updateChangesState(repository, () => ({ commitMode: 'copilot' }))
    assert.strictEqual(cache.get(alias).changesState.commitMode, 'copilot')
  })

  it('safely restores manual mode for unknown stored values', () => {
    const repository = createRepository(1)
    for (const value of ['', 'unknown', 'COPILOT', '{"mode":"copilot"}']) {
      localStorage.setItem('commit-mode-1', value)
      assert.strictEqual(getCommitMode(repository), 'manual')
      assert.strictEqual(
        createTestRepositoryStateCache().get(repository).changesState
          .commitMode,
        'manual'
      )
    }
  })

  it('ignores the unreleased global preference rather than migrating it to every repository', () => {
    localStorage.setItem('commit-mode', 'copilot')
    const cache = createTestRepositoryStateCache()
    assert.strictEqual(
      cache.get(createRepository(1)).changesState.commitMode,
      'manual'
    )
    assert.strictEqual(
      cache.get(createRepository(2)).changesState.commitMode,
      'manual'
    )
    assert.strictEqual(localStorage.getItem('commit-mode-1'), null)
    assert.strictEqual(localStorage.getItem('commit-mode-2'), null)
  })
})
