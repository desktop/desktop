import assert from 'node:assert'
import { beforeEach, afterEach, describe, it } from 'node:test'
import {
  getPushAfterAssistedCommit,
  storePushAfterAssistedCommit,
} from '../../src/lib/stores/helpers/assisted-commit-push-storage'
import { Repository } from '../../src/models/repository'
import { createTestRepositoryStateCache } from '../helpers/app-store-test-harness'

function repository(id: number) {
  return new Repository(`/repositories/${id}`, id, null, false)
}

describe('repository assisted push preference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults off and never migrates a global or manual preference', () => {
    localStorage.setItem('push-after-committing', 'true')
    localStorage.setItem('assisted-commit-push', 'true')
    assert.strictEqual(getPushAfterAssistedCommit(repository(1)), false)
    assert.strictEqual(
      createTestRepositoryStateCache().get(repository(1)).changesState
        .pushAfterAssistedCommit,
      false
    )
  })

  it('durably remembers independent opt-in for two repositories across cache reconstruction', () => {
    storePushAfterAssistedCommit(repository(1), true)
    storePushAfterAssistedCommit(repository(2), false)
    const cache = createTestRepositoryStateCache()
    assert.strictEqual(
      cache.get(repository(1)).changesState.pushAfterAssistedCommit,
      true
    )
    assert.strictEqual(
      cache.get(repository(2)).changesState.pushAfterAssistedCommit,
      false
    )
    storePushAfterAssistedCommit(repository(2), true)
    storePushAfterAssistedCommit(repository(1), false)
    const restarted = createTestRepositoryStateCache()
    assert.strictEqual(
      restarted.get(repository(1)).changesState.pushAfterAssistedCommit,
      false
    )
    assert.strictEqual(
      restarted.get(repository(2)).changesState.pushAfterAssistedCommit,
      true
    )
  })

  it('keeps the same database ID preference for renamed paths and cached aliases', () => {
    const first = repository(1)
    const alias = new Repository(first.path, first.id, null, false, 'Alias')
    const moved = new Repository('/moved/repository', first.id, null, false)
    const cache = createTestRepositoryStateCache()
    cache.get(alias)
    storePushAfterAssistedCommit(first, true)
    cache.updateChangesState(first, () => ({ pushAfterAssistedCommit: true }))
    assert.strictEqual(
      cache.get(alias).changesState.pushAfterAssistedCommit,
      true
    )
    assert.strictEqual(getPushAfterAssistedCommit(moved), true)
    cache.updateChangesState(alias, () => ({ pushAfterAssistedCommit: false }))
    assert.strictEqual(
      cache.get(first).changesState.pushAfterAssistedCommit,
      false
    )
    assert.strictEqual(
      cache.get(repository(2)).changesState.pushAfterAssistedCommit,
      false
    )
  })

  it('treats every missing or invalid stored value as off', () => {
    for (const value of ['', '1', 'yes', 'TRUE', 'false', '{"enabled":true}']) {
      localStorage.setItem('assisted-commit-push-1', value)
      assert.strictEqual(getPushAfterAssistedCommit(repository(1)), false)
      assert.strictEqual(
        createTestRepositoryStateCache().get(repository(1)).changesState
          .pushAfterAssistedCommit,
        false
      )
    }
  })

  it('shares only persisted preferences, not assisted run state, across worktree paths', () => {
    const main = repository(1)
    const worktree = new Repository('/linked/worktree', main.id, null, false)
    const cache = createTestRepositoryStateCache()
    cache.updateChangesState(main, () => ({
      pushAfterAssistedCommit: true,
      assistedCommit: {
        kind: 'preparing',
        runId: 'main-run',
        cancelRequested: false,
      },
      assistedCommitAvailable: true,
    }))
    assert.strictEqual(
      cache.get(worktree).changesState.pushAfterAssistedCommit,
      true
    )
    assert.strictEqual(
      cache.get(worktree).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(
      cache.get(worktree).changesState.assistedCommitAvailable,
      false
    )
    cache.updateChangesState(worktree, () => ({
      pushAfterAssistedCommit: false,
    }))
    assert.strictEqual(
      cache.get(main).changesState.pushAfterAssistedCommit,
      false
    )
    assert.strictEqual(
      cache.get(main).changesState.assistedCommit.kind,
      'preparing'
    )
  })

  it('isolates preferences for unpersisted repository placeholders', () => {
    const first = new Repository('/placeholder', -1, null, false)
    const second = new Repository(
      '/placeholder',
      -1,
      null,
      false,
      'another-placeholder'
    )
    const cache = createTestRepositoryStateCache()
    cache.updateChangesState(first, () => ({ pushAfterAssistedCommit: true }))
    assert.strictEqual(
      cache.get(second).changesState.pushAfterAssistedCommit,
      false
    )
  })
})
