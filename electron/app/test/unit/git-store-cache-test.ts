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
})
