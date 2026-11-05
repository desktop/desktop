import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { shell } from '../helpers/test-app-shell'
import { TestStatsStore } from '../helpers/test-stats-store'
import noop from 'lodash/noop'

describe('GitStoreCache', () => {
  it('returns same instance of GitStore', () => {
    const repository = new Repository('/something/path', 1, null, false)
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    const first = cache.get(repository)
    const second = cache.get(repository)

    assert.equal(first, second)
  })

  it('returns different instance of GitStore after removing', () => {
    const repository = new Repository('/something/path', 1, null, false)
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    const first = cache.get(repository)
    cache.remove(repository)
    const second = cache.get(repository)

    assert.notEqual(first, second)
  })

  it('keeps one GitStore when the account changes', () => {
    const alice = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'alice'
    )
    const bob = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'bob'
    )
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    const gitStore = cache.get(alice)
    cache.setRepository(bob)

    assert.equal(cache.get(bob), gitStore)
    // An older snapshot doesn't roll the store back.
    assert.equal(cache.get(alice), gitStore)
    assert.equal(gitStore.repository, bob)
  })

  it('keeps separate GitStores for worktrees of the same repository', () => {
    const main = new Repository('/main', 1, null, false)
    const worktree = new Repository('/worktree', 1, null, false)
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    assert.notEqual(cache.get(main), cache.get(worktree))
  })

  it('keeps separate GitStores for repositories that are not persisted', () => {
    const first = new Repository('/path', -1, null, false)
    const second = new Repository('/path', -1, null, false, 'alias')
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    assert.notEqual(cache.get(first), cache.get(second))
  })

  it('reports updates with the current repository', () => {
    const alice = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'alice'
    )
    const bob = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'bob'
    )
    const updated = new Array<Repository>()
    const cache = new GitStoreCache(
      shell,
      new TestStatsStore(),
      repository => updated.push(repository),
      noop
    )

    const gitStore = cache.get(alice)
    cache.setRepository(bob)
    gitStore.setCommitMessage({ summary: 'x', description: null, timestamp: 1 })

    assert.deepEqual(updated, [bob])
  })

  it('stops reporting updates of a removed GitStore', () => {
    const repository = new Repository('/path', 1, null, false)
    let updates = 0
    const cache = new GitStoreCache(
      shell,
      new TestStatsStore(),
      () => updates++,
      noop
    )

    const gitStore = cache.get(repository)
    cache.remove(repository)
    gitStore.setCommitMessage({ summary: 'x', description: null, timestamp: 1 })

    assert.equal(updates, 0)
  })

  it('moves the GitStore to a new path', () => {
    const before = new Repository('/before', 1, null, false)
    const after = new Repository('/after', 1, null, false)
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    const gitStore = cache.get(before)
    cache.transfer(before, after)

    assert.equal(cache.get(after), gitStore)
    assert.equal(gitStore.repository, after)
    assert.notEqual(cache.get(before), gitStore)
  })

  it('creates a GitStore with a repository adopted before it existed', () => {
    const alice = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'alice'
    )
    const bob = new Repository(
      '/path',
      1,
      null,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      'bob'
    )
    const cache = new GitStoreCache(shell, new TestStatsStore(), noop, noop)

    cache.setRepository(bob)

    assert.equal(cache.get(alice).repository, bob)
  })
})
