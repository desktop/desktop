import { describe, it } from 'node:test'
import assert from 'node:assert'
import { forceUnwrap } from '../../src/lib/fatal-error'

describe('forceUnwrap', () => {
  it('fails for null', () => {
    const message = 'null is an expected failure'
    try {
      forceUnwrap(message, null)
    } catch (e) {
      const error = e as Error
      assert.equal(error.message, message)
    }
  })

  it('fails for undefined', () => {
    const message = 'undefined is an expected failure'
    try {
      forceUnwrap(message, undefined)
    } catch (e) {
      const error = e as Error
      assert.equal(error.message, message)
    }
  })

  it('passes for false', () => {
    assert.equal(forceUnwrap('false is an expected value', false), false)
  })

  it('passes for a hash', () => {
    const a = { b: 4 }
    assert.equal(forceUnwrap('hash is an expected value', a), a)
  })
})
