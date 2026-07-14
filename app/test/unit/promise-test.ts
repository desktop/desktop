import { describe, it, mock, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { timeout, sleep } from '../../src/lib/promise'

describe('timeout', () => {
  beforeEach(() => mock.timers.enable())
  afterEach(() => mock.timers.reset())

  it('falls back to the fallback value if promise takes too long', async () => {
    const promise = timeout(
      sleep(1000).then(() => 'foo'),
      500,
      'bar'
    )
    mock.timers.tick(500)
    assert.equal(await promise, 'bar')
  })

  it('returns the promise result if it finishes in time', async () => {
    const promise = timeout(Promise.resolve('foo'), 500, 'bar')
    mock.timers.tick(500)
    assert.equal(await promise, 'foo')
  })
})
