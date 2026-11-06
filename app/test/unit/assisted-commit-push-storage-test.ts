import assert from 'node:assert'
import { beforeEach, afterEach, describe, it } from 'node:test'
import {
  getPushAfterCommit,
  storePushAfterCommit,
} from '../../src/lib/stores/helpers/commit-push-storage'
import { Repository } from '../../src/models/repository'
import { createTestRepositoryStateCache } from '../helpers/app-store-test-harness'

function repository(id: number) {
  return new Repository(`/repositories/${id}`, id, null, false)
}

describe('shared repository commit push preference', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('defaults off and ignores unreleased global preferences', () => {
    localStorage.setItem('push-after-committing', 'true')
    localStorage.setItem('assisted-commit-push', 'true')
    assert.strictEqual(getPushAfterCommit(repository(1)), false)
    assert.strictEqual(
      createTestRepositoryStateCache().get(repository(1)).changesState
        .pushAfterCommit,
      false
    )
  })

  it('uses one automatic push setting in both modes', () => {
    const repo = repository(1)
    localStorage.setItem('automatic-commit-push-1', 'true')
    const cache = createTestRepositoryStateCache()
    for (const commitMode of ['manual', 'copilot'] as const) {
      cache.updateChangesState(repo, () => ({ commitMode }))
      assert.strictEqual(cache.get(repo).changesState.pushAfterCommit, true)
    }
    storePushAfterCommit(repo, false)
    assert.strictEqual(localStorage.getItem('automatic-commit-push-1'), 'false')
    assert.strictEqual(
      createTestRepositoryStateCache().get(repo).changesState.pushAfterCommit,
      false
    )
  })

  it('ignores the unreleased assisted preference without migrating it', () => {
    const repo = repository(1)
    localStorage.setItem('assisted-commit-push-1', 'true')
    assert.strictEqual(getPushAfterCommit(repo), false)
    assert.strictEqual(
      createTestRepositoryStateCache().get(repo).changesState.pushAfterCommit,
      false
    )
    assert.strictEqual(localStorage.getItem('automatic-commit-push-1'), null)
    storePushAfterCommit(repo, true)
    storePushAfterCommit(repo, false)
    assert.strictEqual(getPushAfterCommit(repo), false)
    assert.strictEqual(localStorage.getItem('automatic-commit-push-1'), 'false')
    assert.strictEqual(localStorage.getItem('assisted-commit-push-1'), 'true')
  })

  it('durably remembers independent opt-in for two repositories across cache reconstruction', () => {
    storePushAfterCommit(repository(1), true)
    storePushAfterCommit(repository(2), false)
    const cache = createTestRepositoryStateCache()
    assert.strictEqual(
      cache.get(repository(1)).changesState.pushAfterCommit,
      true
    )
    assert.strictEqual(
      cache.get(repository(2)).changesState.pushAfterCommit,
      false
    )
    storePushAfterCommit(repository(2), true)
    storePushAfterCommit(repository(1), false)
    const restarted = createTestRepositoryStateCache()
    assert.strictEqual(
      restarted.get(repository(1)).changesState.pushAfterCommit,
      false
    )
    assert.strictEqual(
      restarted.get(repository(2)).changesState.pushAfterCommit,
      true
    )
  })

  it('keeps the same database ID preference for renamed paths and cached aliases', () => {
    const first = repository(1)
    const alias = new Repository(first.path, first.id, null, false, 'Alias')
    const moved = new Repository('/moved/repository', first.id, null, false)
    const cache = createTestRepositoryStateCache()
    cache.get(alias)
    storePushAfterCommit(first, true)
    cache.updateChangesState(first, () => ({ pushAfterCommit: true }))
    assert.strictEqual(cache.get(alias).changesState.pushAfterCommit, true)
    assert.strictEqual(getPushAfterCommit(moved), true)
    cache.updateChangesState(alias, () => ({ pushAfterCommit: false }))
    assert.strictEqual(cache.get(first).changesState.pushAfterCommit, false)
    assert.strictEqual(
      cache.get(repository(2)).changesState.pushAfterCommit,
      false
    )
  })

  it('treats every missing or invalid stored value as off', () => {
    for (const value of ['', '1', 'yes', 'TRUE', 'false', '{"enabled":true}']) {
      localStorage.setItem('automatic-commit-push-1', value)
      assert.strictEqual(getPushAfterCommit(repository(1)), false)
      assert.strictEqual(
        createTestRepositoryStateCache().get(repository(1)).changesState
          .pushAfterCommit,
        false
      )
    }
  })

  it('shares only persisted preferences, not assisted run state, across worktree paths', () => {
    const main = repository(1)
    const worktree = new Repository('/linked/worktree', main.id, null, false)
    const cache = createTestRepositoryStateCache()
    cache.updateChangesState(main, () => ({
      pushAfterCommit: true,
      assistedCommit: {
        kind: 'preparing',
        runId: 'main-run',
        cancelRequested: false,
      },
      assistedCommitAvailable: true,
    }))
    assert.strictEqual(cache.get(worktree).changesState.pushAfterCommit, true)
    assert.strictEqual(
      cache.get(worktree).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(
      cache.get(worktree).changesState.assistedCommitAvailable,
      false
    )
    cache.updateChangesState(worktree, () => ({
      pushAfterCommit: false,
    }))
    assert.strictEqual(cache.get(main).changesState.pushAfterCommit, false)
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
    localStorage.setItem('automatic-commit-push--1', 'true')
    assert.strictEqual(getPushAfterCommit(first), false)
    storePushAfterCommit(first, true)
    localStorage.removeItem('automatic-commit-push--1')
    storePushAfterCommit(first, true)
    assert.strictEqual(localStorage.getItem('automatic-commit-push--1'), null)
    cache.updateChangesState(first, () => ({ pushAfterCommit: true }))
    assert.strictEqual(cache.get(second).changesState.pushAfterCommit, false)
  })
})
